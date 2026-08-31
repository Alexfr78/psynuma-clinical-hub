import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { useCenter } from '@/hooks/useCenter';
import { Icon } from '@/components/ui/icon';

interface PatientAIReportsProps {
  patientId: string;
}

export function PatientAIReports({ patientId }: PatientAIReportsProps) {
  const { centerId } = useCenter();
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['patient-ai-reports', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, session_date, session_type, ai_summary_clinical, ai_summary_patient, transcript_processed_at, patient:patients!sessions_patient_id_fkey(phone, email)')
        .eq('patient_id', patientId)
        .not('ai_summary_clinical', 'is', null)
        .order('session_date', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!patientId,
  });

  type AIReportSession = NonNullable<typeof sessions>[number];

  const handleSend = async (session: AIReportSession, channel: 'whatsapp' | 'email') => {
    if (!session.ai_summary_patient || !centerId) return;
    const recipient = channel === 'whatsapp' ? session.patient?.phone : session.patient?.email;
    if (!recipient) return;

    setSendingId(session.id);
    try {
      const { data: notification } = await supabase
        .from('notifications')
        .insert({
          center_id: centerId,
          session_id: session.id,
          patient_id: patientId,
          type: channel,
          recipient,
          subject: channel === 'email' ? 'Resumen de tu sesión' : undefined,
          message: session.ai_summary_patient,
          status: 'pending',
        })
        .select('id')
        .single();

      if (notification) {
        await supabase.functions.invoke('send-notification', {
          body: { notificationId: notification.id },
        });
        toast.success(`Informe enviado por ${channel === 'whatsapp' ? 'WhatsApp' : 'email'}`);
      }
    } catch {
      toast.error('Error al enviar el informe');
    } finally {
      setSendingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <Icon name="psychology" className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 font-display text-lg font-semibold">Sin informes IA</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Los informes se generan desde el detalle de cada sesión → "Analizar transcripción".
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <Collapsible key={session.id}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Icon name="psychology" className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    {format(new Date(session.session_date), "d 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                  {session.session_type && (
                    <p className="text-xs text-muted-foreground capitalize">{session.session_type}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {session.ai_summary_clinical && (
                  <Badge variant="outline" className="text-xs">Clínico</Badge>
                )}
                {session.ai_summary_patient && (
                  <Badge variant="outline" className="text-xs">Paciente</Badge>
                )}
                <Icon name="expand_more" className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3 space-y-3">
            {session.ai_summary_clinical && (
              <div className="space-y-1 mt-3">
                <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Icon name="description" className="h-3 w-3" />
                  Informe clínico
                </p>
                <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {session.ai_summary_clinical}
                </div>
              </div>
            )}
            {session.ai_summary_patient && (
              <div className="space-y-2">
                <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Icon name="person" className="h-3 w-3" />
                  Informe para el paciente
                </p>
                <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {session.ai_summary_patient}
                </div>
                <div className="flex gap-2">
                  {session.patient?.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendingId === session.id}
                      onClick={() => handleSend(session, 'whatsapp')}
                    >
                      {sendingId === session.id ? <Icon name="progress_activity" className="h-3 w-3 mr-1 animate-spin" /> : <Icon name="call" className="h-3 w-3 mr-1" />}
                      WhatsApp
                    </Button>
                  )}
                  {session.patient?.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendingId === session.id}
                      onClick={() => handleSend(session, 'email')}
                    >
                      {sendingId === session.id ? <Icon name="progress_activity" className="h-3 w-3 mr-1 animate-spin" /> : <Icon name="mail" className="h-3 w-3 mr-1" />}
                      Email
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
