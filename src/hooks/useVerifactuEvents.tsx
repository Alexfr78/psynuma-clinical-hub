import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCenter } from "./useCenter";
import { format, startOfDay, endOfDay } from "date-fns";

export interface VerifactuEvent {
  id: string;
  center_id: string;
  invoice_id: string | null;
  event_type: string;
  environment: string | null;
  http_status: number | null;
  aeat_csv: string | null;
  aeat_response_code: string | null;
  aeat_response_message: string | null;
  aeat_response_xml: string | null;
  xml_sent: string | null;
  error_details: string | null;
  retry_count: number | null;
  created_at: string;
}

interface UseVerifactuEventsParams {
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export function useVerifactuEvents(params: UseVerifactuEventsParams = {}) {
  const { center } = useCenter();

  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ["verifactu-events", center?.id, params],
    queryFn: async () => {
      if (!center?.id) return [];

      let query = supabase
        .from("verifactu_events")
        .select("*")
        .eq("center_id", center.id)
        .order("created_at", { ascending: false });

      if (params.eventType && params.eventType !== "all") {
        query = query.eq("event_type", params.eventType);
      }

      if (params.startDate) {
        query = query.gte("created_at", startOfDay(params.startDate).toISOString());
      }

      if (params.endDate) {
        query = query.lte("created_at", endOfDay(params.endDate).toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filter by search if provided
      if (params.search && data) {
        const searchLower = params.search.toLowerCase();
        return data.filter((event) => 
          event.invoice_id?.toLowerCase().includes(searchLower) ||
          event.event_type?.toLowerCase().includes(searchLower) ||
          event.aeat_csv?.toLowerCase().includes(searchLower)
        );
      }

      return data as VerifactuEvent[];
    },
    enabled: !!center?.id,
  });

  // Calculate statistics
  const stats = {
    total: events.length,
    today: events.filter((e) => {
      const eventDate = new Date(e.created_at);
      const today = new Date();
      return (
        eventDate.getDate() === today.getDate() &&
        eventDate.getMonth() === today.getMonth() &&
        eventDate.getFullYear() === today.getFullYear()
      );
    }).length,
    rfGenerated: events.filter((e) => e.event_type === "alta" || e.event_type === "xml_generated").length,
    errors: events.filter((e) => e.event_type === "error" || e.http_status === 500).length,
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      "Fecha/Hora",
      "Tipo",
      "ID Factura",
      "Entorno",
      "HTTP Status",
      "CSV AEAT",
      "Código Respuesta",
      "Mensaje Respuesta",
      "Error",
    ];

    const rows = events.map((event) => [
      format(new Date(event.created_at), "dd/MM/yyyy HH:mm:ss"),
      event.event_type,
      event.invoice_id || "",
      event.environment || "",
      event.http_status?.toString() || "",
      event.aeat_csv || "",
      event.aeat_response_code || "",
      event.aeat_response_message || "",
      event.error_details || "",
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(";")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `verifactu_audit_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`;
    link.click();
  };

  // Export to JSON
  const exportToJSON = () => {
    const jsonContent = JSON.stringify(events, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `verifactu_audit_${format(new Date(), "yyyyMMdd_HHmmss")}.json`;
    link.click();
  };

  return {
    events,
    isLoading,
    refetch,
    stats,
    exportToCSV,
    exportToJSON,
  };
}
