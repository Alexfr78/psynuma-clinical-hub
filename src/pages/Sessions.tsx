import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Loader2, Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSessions, SessionWithRelations } from '@/hooks/useSessions';
import { useProfessionals } from '@/hooks/usePatients';
import { SessionCard } from '@/components/agenda/SessionCard';
import { CreateSessionDialog } from '@/components/agenda/CreateSessionDialog';
import { SessionDetailDialog } from '@/components/agenda/SessionDetailDialog';
import { TranscriptionAnalysisDialog } from '@/components/agenda/TranscriptionAnalysisDialog';

export default function Sessions() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [professionalFilter, setProfessionalFilter] = useState('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionWithRelations | null>(null);
  const [transcriptionSessionId, setTranscriptionSessionId] = useState<string | null>(null);
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);

  const { data: professionals } = useProfessionals();
  const { data: sessions, isLoading } = useSessions(undefined, undefined, professionalFilter);

  const filteredSessions = sessions?.filter((session) => {
    const matchesSearch = !search || 
      session.patient?.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      session.patient?.last_name?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  // Group sessions by date
  const groupedSessions = filteredSessions.reduce((groups, session) => {
    const date = session.session_date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(session);
    return groups;
  }, {} as Record<string, SessionWithRelations[]>);

  const sortedDates = Object.keys(groupedSessions).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Sesiones</h1>
          <p className="text-muted-foreground">
            Historial completo de sesiones
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          Nueva Sesión
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por contacto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="scheduled">Programada</SelectItem>
            <SelectItem value="confirmed">Confirmada</SelectItem>
            <SelectItem value="completed">Completada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
            <SelectItem value="no_show">No asistió</SelectItem>
          </SelectContent>
        </Select>

        <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Profesional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {professionals?.map((prof) => (
              <SelectItem key={prof.id} value={prof.id}>
                {prof.first_name} {prof.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sessions List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredSessions.length > 0 ? (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date}>
              <h3 className="mb-3 font-display font-semibold capitalize sticky top-0 bg-background py-2 z-10">
                {format(new Date(date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
              </h3>
              <div className="space-y-2">
                {groupedSessions[date].map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onClick={() => setSelectedSession(session)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 font-display text-lg font-semibold">Sin sesiones</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {search || statusFilter !== 'all'
              ? 'No se encontraron sesiones con los filtros seleccionados.'
              : 'No hay sesiones registradas aún.'}
          </p>
        </div>
      )}

      {/* Stats */}
      {filteredSessions.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Mostrando {filteredSessions.length} sesión{filteredSessions.length !== 1 ? 'es' : ''}
        </div>
      )}

      {/* Dialogs */}
      <CreateSessionDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        initialDate={new Date()}
        initialTime="09:00"
      />

      <SessionDetailDialog
        session={selectedSession}
        open={!!selectedSession}
        onOpenChange={(open) => !open && setSelectedSession(null)}
        onAnalyzeTranscription={(id) => {
          setTranscriptionSessionId(id);
          setTimeout(() => setTranscriptionOpen(true), 300);
        }}
      />

      {transcriptionSessionId && (() => {
        const s = sessions?.find(s => s.id === transcriptionSessionId);
        const pName = s?.patient ? `${s.patient.first_name} ${s.patient.last_name}` : undefined;
        return (
          <TranscriptionAnalysisDialog
            open={transcriptionOpen}
            onOpenChange={(open) => {
              setTranscriptionOpen(open);
              if (!open) setTranscriptionSessionId(null);
            }}
            sessionId={transcriptionSessionId}
            patientName={pName}
            patientPhone={s?.patient?.phone}
            patientEmail={s?.patient?.email}
            sessionDate={s?.session_date}
          />
        );
      })()}
    </div>
  );
}
