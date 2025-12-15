import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield,
  RefreshCw,
  FileText,
  FileJson,
  Search,
  CalendarIcon,
  Eye,
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useVerifactuEvents, VerifactuEvent } from "@/hooks/useVerifactuEvents";

const EVENT_TYPES = [
  { value: "all", label: "Todos los tipos" },
  { value: "alta", label: "RF enviado" },
  { value: "xml_generated", label: "RF generado" },
  { value: "aeat_response", label: "Respuesta AEAT" },
  { value: "error", label: "Error" },
  { value: "consulta", label: "Consulta" },
  { value: "baja", label: "Anulación" },
];

function getEventBadge(eventType: string) {
  switch (eventType) {
    case "alta":
      return { label: "RF enviado", variant: "default" as const, className: "bg-green-500 hover:bg-green-600" };
    case "xml_generated":
      return { label: "RF generado", variant: "default" as const, className: "bg-blue-400 hover:bg-blue-500" };
    case "aeat_response":
      return { label: "Respuesta AEAT", variant: "default" as const, className: "bg-blue-600 hover:bg-blue-700" };
    case "error":
      return { label: "Error", variant: "destructive" as const, className: "" };
    case "consulta":
      return { label: "Consulta", variant: "secondary" as const, className: "" };
    case "baja":
      return { label: "Anulación", variant: "default" as const, className: "bg-orange-500 hover:bg-orange-600" };
    default:
      return { label: eventType, variant: "outline" as const, className: "" };
  }
}

function truncateId(id: string | null): string {
  if (!id) return "-";
  return id.length > 8 ? `${id.substring(0, 8)}...` : id;
}

function truncateDetails(event: VerifactuEvent): string {
  const details: Record<string, string | number | null> = {};
  
  if (event.aeat_csv) details.csv = event.aeat_csv;
  if (event.aeat_response_code) details.code = event.aeat_response_code;
  if (event.http_status) details.http = event.http_status;
  if (event.error_details) details.error = event.error_details.substring(0, 30);
  
  if (Object.keys(details).length === 0) return "-";
  
  const json = JSON.stringify(details);
  return json.length > 40 ? `${json.substring(0, 40)}...` : json;
}

export default function Audit() {
  const [eventType, setEventType] = useState("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [search, setSearch] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    eventType: "all",
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    search: "",
  });
  const [selectedEvent, setSelectedEvent] = useState<VerifactuEvent | null>(null);

  const { events, isLoading, refetch, stats, exportToCSV, exportToJSON } = useVerifactuEvents({
    eventType: appliedFilters.eventType,
    startDate: appliedFilters.startDate,
    endDate: appliedFilters.endDate,
    search: appliedFilters.search,
  });

  const handleApplyFilters = () => {
    setAppliedFilters({
      eventType,
      startDate,
      endDate,
      search,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Registro de Auditoría</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Historial inmutable VeriFactu
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <FileText className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportToJSON}>
            <FileJson className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">JSON</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Eventos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.today}</p>
                <p className="text-sm text-muted-foreground">Hoy</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.rfGenerated}</p>
                <p className="text-sm text-muted-foreground">RF Generados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.errors}</p>
                <p className="text-sm text-muted-foreground">Errores</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por factura, tipo de evento..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Tipo de evento" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[140px] justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd/MM/yyyy") : "Desde"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  locale={es}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[140px] justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd/MM/yyyy") : "Hasta"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  locale={es}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Button onClick={handleApplyFilters}>Aplicar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
            <Info className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Los registros son inmutables y no pueden ser eliminados (requisito VeriFactu Art. 8 RD 1007/2023)
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No hay eventos de auditoría</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>ID Factura</TableHead>
                    <TableHead>Detalles</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="w-[60px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const badge = getEventBadge(event.event_type);
                    return (
                      <TableRow key={event.id}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(event.created_at), "dd/MM/yyyy HH:mm:ss")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant} className={badge.className}>
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {truncateId(event.invoice_id)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                          {truncateDetails(event)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">-</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedEvent(event)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Detalle del Evento
            </DialogTitle>
          </DialogHeader>
          
          {selectedEvent && (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Fecha/Hora</p>
                    <p className="font-mono">
                      {format(new Date(selectedEvent.created_at), "dd/MM/yyyy HH:mm:ss")}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tipo</p>
                    <Badge
                      variant={getEventBadge(selectedEvent.event_type).variant}
                      className={getEventBadge(selectedEvent.event_type).className}
                    >
                      {getEventBadge(selectedEvent.event_type).label}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">ID Factura</p>
                    <p className="font-mono text-sm break-all">
                      {selectedEvent.invoice_id || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Entorno</p>
                    <Badge variant={selectedEvent.environment === "production" ? "default" : "secondary"}>
                      {selectedEvent.environment || "test"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">HTTP Status</p>
                    <p className={cn(
                      "font-mono",
                      selectedEvent.http_status === 200 ? "text-green-600" : 
                      selectedEvent.http_status && selectedEvent.http_status >= 400 ? "text-destructive" : ""
                    )}>
                      {selectedEvent.http_status || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">CSV AEAT</p>
                    <p className="font-mono text-sm">{selectedEvent.aeat_csv || "-"}</p>
                  </div>
                </div>

                {/* AEAT Response */}
                {(selectedEvent.aeat_response_code || selectedEvent.aeat_response_message) && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Respuesta AEAT</p>
                    <div className="bg-muted p-3 rounded-lg space-y-1">
                      {selectedEvent.aeat_response_code && (
                        <p className="text-sm">
                          <span className="font-medium">Código:</span> {selectedEvent.aeat_response_code}
                        </p>
                      )}
                      {selectedEvent.aeat_response_message && (
                        <p className="text-sm">
                          <span className="font-medium">Mensaje:</span> {selectedEvent.aeat_response_message}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Error Details */}
                {selectedEvent.error_details && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Detalles del Error</p>
                    <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg">
                      <p className="text-sm text-destructive font-mono whitespace-pre-wrap">
                        {selectedEvent.error_details}
                      </p>
                    </div>
                  </div>
                )}

                {/* XML Sent */}
                {selectedEvent.xml_sent && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">XML Enviado</p>
                    <div className="bg-muted p-3 rounded-lg max-h-[200px] overflow-auto">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                        {selectedEvent.xml_sent}
                      </pre>
                    </div>
                  </div>
                )}

                {/* AEAT Response XML */}
                {selectedEvent.aeat_response_xml && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">XML Respuesta AEAT</p>
                    <div className="bg-muted p-3 rounded-lg max-h-[200px] overflow-auto">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                        {selectedEvent.aeat_response_xml}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
