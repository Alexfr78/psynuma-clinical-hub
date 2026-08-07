import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, X, Loader2, Clock, User, MapPin, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from '@/hooks/useCenter';
import { toast } from 'sonner';

interface PendingSession {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  session_modality: string;
  patient: {
    id: string;
    first_name: string;
    last_name: string;
  };
  location: {
    id: string;
    name: string;
    location_type: string;
  } | null;
}

export function PendingApprovalsPanel() {
  const { center } = useCenter();
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: pendingSessions, isLoading } = useQuery({
    queryKey: ['pending-approvals', center?.id],
    queryFn: async () => {
      if (!center?.id) return [];
      
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          session_date,
          start_time,
          end_time,
          session_type,
          session_modality,
          patient:patients!sessions_patient_id_fkey(id, first_name, last_name),
          location:center_locations(id, name, location_type)
        `)
        .eq('center_id', center.id)
        .eq('status', 'pending_approval')
        .order('session_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      return (data || []) as PendingSession[];
    },
    enabled: !!center?.id,
  });

  const approveMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.functions.invoke('approve-session-request', {
        body: { session_id: sessionId },
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Cita aprobada');
    },
    onError: () => {
      toast.error('Error al aprobar la cita');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('sessions')
        .update({ 
          status: 'cancelled',
          cancellation_origin: 'professional',
          cancellation_reason: 'Rechazada por el profesional'
        })
        .eq('id', sessionId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Cita rechazada');
    },
    onError: () => {
      toast.error('Error al rechazar la cita');
    },
  });

  const handleApprove = async (sessionId: string) => {
    setProcessingId(sessionId);
    await approveMutation.mutateAsync(sessionId);
    setProcessingId(null);
  };

  const handleReject = async (sessionId: string) => {
    setProcessingId(sessionId);
    await rejectMutation.mutateAsync(sessionId);
    setProcessingId(null);
  };

  if (!center?.portal_require_approval) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!pendingSessions?.length) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Citas pendientes de aprobación</CardTitle>
          <Badge variant="secondary" className="bg-amber-100 text-amber-700">
            {pendingSessions.length}
          </Badge>
        </div>
        <CardDescription>
          Solicitudes de citas desde el portal de contactos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pendingSessions.map((session) => (
          <div 
            key={session.id}
            className="flex items-center justify-between gap-4 p-3 bg-background rounded-lg border"
          >
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium truncate">
                  {session.patient.first_name} {session.patient.last_name}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {format(new Date(session.session_date), "EEE d MMM", { locale: es })} {session.start_time.substring(0, 5)}
                  </span>
                </div>
                <span className="text-xs">{session.session_type}</span>
                {session.location && (
                  <div className="flex items-center gap-1">
                    {session.location.location_type === 'online' ? (
                      <Video className="h-3.5 w-3.5" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5" />
                    )}
                    <span className="truncate max-w-[100px]">{session.location.name}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReject(session.id)}
                disabled={processingId === session.id}
                className="text-destructive hover:text-destructive"
              >
                {processingId === session.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => handleApprove(session.id)}
                disabled={processingId === session.id}
              >
                {processingId === session.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
