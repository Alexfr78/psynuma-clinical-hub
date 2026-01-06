import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type Notification = Tables<'notifications'>;
export type NotificationInsert = TablesInsert<'notifications'>;

export interface NotificationWithRelations extends Notification {
  patients?: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  sessions?: {
    session_date: string;
    start_time: string;
  } | null;
}

export interface SendNotificationResult {
  success: boolean;
  results?: Array<{
    id: string;
    type: string;
    recipient: string;
    success: boolean;
    error?: string | null;
    whatsappWebLink?: string | null;
  }>;
}

export function useNotifications(filters?: { 
  status?: string; 
  type?: string;
  patientId?: string;
}) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['notifications', profile?.center_id, filters],
    queryFn: async () => {
      let query = supabase
        .from('notifications')
        .select(`
          *,
          patients:patient_id (first_name, last_name, email, phone),
          sessions:session_id (session_date, start_time)
        `)
        .eq('center_id', profile!.center_id!)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status as 'pending' | 'sent' | 'failed');
      }
      if (filters?.type) {
        query = query.eq('type', filters.type as 'email' | 'sms' | 'whatsapp');
      }
      if (filters?.patientId) {
        query = query.eq('patient_id', filters.patientId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as NotificationWithRelations[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useCreateNotification() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (notification: Omit<NotificationInsert, 'center_id'>) => {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          ...notification,
          center_id: profile!.center_id!,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'No se pudo crear la notificación.',
        variant: 'destructive',
      });
      console.error('Error creating notification:', error);
    },
  });
}

export function useSendNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (notificationId: string): Promise<SendNotificationResult> => {
      const { data, error } = await supabase.functions.invoke('send-notification', {
        body: { notificationId },
      });

      if (error) throw error;
      return data as SendNotificationResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      
      // Check if this was a WhatsApp Web notification (has link)
      const results = data?.results || [];
      const whatsappWebResult = results.find(r => r.type === 'whatsapp' && r.whatsappWebLink);
      
      // Only show toast for non-WhatsApp-web notifications
      // WhatsApp Web will be handled by the component with a dialog
      if (!whatsappWebResult) {
        const hasSuccess = results.some(r => r.success);
        const hasError = results.some(r => !r.success);
        
        if (hasSuccess && !hasError) {
          toast({
            title: 'Notificación enviada',
            description: 'La notificación se ha enviado correctamente.',
          });
        } else if (hasError) {
          toast({
            title: 'Error parcial',
            description: 'Algunas notificaciones no se pudieron enviar.',
            variant: 'destructive',
          });
        }
      }
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'No se pudo enviar la notificación.',
        variant: 'destructive',
      });
      console.error('Error sending notification:', error);
    },
  });
}

export function useScheduleSessionReminder() {
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      sessionId,
      patientId,
      patientName,
      patientEmail,
      patientPhone,
      sessionDate,
      sessionDateISO,
      sessionTime,
      reminderTypes,
    }: {
      sessionId: string;
      patientId: string;
      patientName: string;
      patientEmail?: string | null;
      patientPhone?: string | null;
      sessionDate: string;
      sessionDateISO: string; // Format: yyyy-MM-dd
      sessionTime: string;
      reminderTypes: { email: boolean; sms: boolean; whatsapp: boolean };
    }) => {
      const notifications: NotificationInsert[] = [];
      const reminderDate = new Date(sessionDateISO);
      reminderDate.setDate(reminderDate.getDate() - 1);
      reminderDate.setHours(10, 0, 0, 0);

      const message = `Recordatorio: Tiene una cita programada para mañana ${sessionDate} a las ${sessionTime}. ¿Confirma su asistencia?`;

      if (reminderTypes.email && patientEmail) {
        notifications.push({
          center_id: profile!.center_id!,
          patient_id: patientId,
          session_id: sessionId,
          type: 'email',
          recipient: patientEmail,
          subject: `Recordatorio de cita - ${sessionDate}`,
          message,
          scheduled_for: reminderDate.toISOString(),
          status: 'pending',
        });
      }

      if (reminderTypes.sms && patientPhone) {
        notifications.push({
          center_id: profile!.center_id!,
          patient_id: patientId,
          session_id: sessionId,
          type: 'sms',
          recipient: patientPhone,
          message,
          scheduled_for: reminderDate.toISOString(),
          status: 'pending',
        });
      }

      if (reminderTypes.whatsapp && patientPhone) {
        notifications.push({
          center_id: profile!.center_id!,
          patient_id: patientId,
          session_id: sessionId,
          type: 'whatsapp',
          recipient: patientPhone,
          message,
          scheduled_for: reminderDate.toISOString(),
          status: 'pending',
        });
      }

      if (notifications.length === 0) return null;

      const { data, error } = await supabase
        .from('notifications')
        .insert(notifications)
        .select();

      if (error) throw error;
      return data;
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'No se pudieron programar los recordatorios.',
        variant: 'destructive',
      });
      console.error('Error scheduling reminders:', error);
    },
  });
}

export function usePendingNotifications() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['notifications', 'pending', profile?.center_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('center_id', profile!.center_id!)
        .eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.center_id,
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notificación eliminada',
        description: 'La notificación se ha eliminado correctamente.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la notificación.',
        variant: 'destructive',
      });
      console.error('Error deleting notification:', error);
    },
  });
}
