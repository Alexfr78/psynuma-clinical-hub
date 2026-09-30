import { listSearchPattern } from '@/lib/list-search';
import { toast } from 'sonner';
import { useQuery, keepPreviousData } from "@tanstack/react-query";
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

  const { exportToCSV, exportToJSON } = verifactuExports(events);

  return {
    events,
    isLoading,
    refetch,
    stats,
    exportToCSV,
    exportToJSON,
  };
}

function verifactuExports(events: VerifactuEvent[]) {
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

  return { exportToCSV, exportToJSON };
}

function verifactuEventsListQuery(filters: UseVerifactuEventsParams, centerId: string, head = false) {
  let query = supabase.from('verifactu_events').select('*', { count: 'exact', head })
    .eq('center_id', centerId);
  if (filters.eventType && filters.eventType !== 'all') query = query.eq('event_type', filters.eventType);
  if (filters.startDate) query = query.gte('created_at', startOfDay(filters.startDate).toISOString());
  if (filters.endDate) query = query.lte('created_at', endOfDay(filters.endDate).toISOString());
  if (filters.search?.trim()) query = query.filter('search_text', 'ilike', listSearchPattern(filters.search));
  return query.order('created_at', { ascending: false }).order('id', { ascending: true });
}

export function useVerifactuEventsPage(filters: UseVerifactuEventsParams, range: { from: number; to: number }) {
  const { center } = useCenter();
  return useQuery({
    queryKey: ['verifactu-events', 'page', filters, range.from, range.to, center?.id],
    queryFn: async () => {
      const { data, count, error } = await verifactuEventsListQuery(filters, center!.id).range(range.from, range.to);
      if (error) throw error;
      return { rows: (data ?? []) as VerifactuEvent[], total: count ?? 0 };
    },
    enabled: !!center?.id,
    placeholderData: keepPreviousData,
  });
}

export function useVerifactuEventStats(filters: UseVerifactuEventsParams) {
  const { center } = useCenter();
  return useQuery({
    queryKey: ['verifactu-events', 'stats', filters, center?.id],
    queryFn: async () => {
      const query = () => verifactuEventsListQuery(filters, center!.id, true);
      const today = new Date();
      const results = await Promise.all([
        query(),
        query().gte('created_at', startOfDay(today).toISOString()).lte('created_at', endOfDay(today).toISOString()),
        query().in('event_type', ['alta', 'xml_generated']),
        query().or('event_type.eq.error,http_status.eq.500'),
      ]);
      for (const result of results) if (result.error) throw result.error;
      const [total, todayCount, rfGenerated, errors] = results.map(result => result.count ?? 0);
      return { total, today: todayCount, rfGenerated, errors };
    },
    enabled: !!center?.id,
  });
}

export async function fetchVerifactuEventList(filters: UseVerifactuEventsParams, centerId: string) {
  const rows: VerifactuEvent[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await verifactuEventsListQuery(filters, centerId).range(from, from + 499);
    if (error) throw error;
    rows.push(...(data ?? []) as VerifactuEvent[]);
    if (!data || data.length < 500) return rows;
  }
}

export function useVerifactuEventExports(filters: UseVerifactuEventsParams) {
  const { center } = useCenter();
  const exportEvents = async (kind: 'exportToCSV' | 'exportToJSON') => {
    if (!center?.id) return;
    try {
      const events = await fetchVerifactuEventList(filters, center.id);
      verifactuExports(events)[kind]();
    } catch {
      toast.error('Error al exportar los eventos');
    }
  };
  return {
    exportToCSV: () => exportEvents('exportToCSV'),
    exportToJSON: () => exportEvents('exportToJSON'),
  };
}
