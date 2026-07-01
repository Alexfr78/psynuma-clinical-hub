import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState, useCallback } from 'react';

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
}

export interface PublicSessionData {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string | null;
  session_type: string | null;
  session_modality: string | null;
  video_call_link: string | null;
  zoom_meeting_id: string | null;
  zoom_password: string | null;
  cancellation_policy: string | null;
  notes: string | null;
  access_token: string | null;
  patient: {
    first_name: string;
    last_name: string;
  } | null;
  professional: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  location: {
    name: string;
    street: string;
    number_details: string | null;
    city: string;
    postal_code: string | null;
  } | null;
  center: {
    name: string;
    address: string | null;
    address_details: string | null;
    city: string | null;
    postal_code: string | null;
  } | null;
  // Fallback center address from secure function
  centerFallback?: {
    center_name: string;
    center_address: string;
  } | null;
}

export function usePublicSession(token: string | undefined) {
  return useQuery({
    queryKey: ['public-session', token],
    queryFn: async () => {
      if (!token) throw new Error('No token provided');

      // Set the token in headers for RLS functions
      const headers = { 'x-session-token': token };

      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          session_date,
          start_time,
          end_time,
          status,
          session_type,
          session_modality,
          video_call_link,
          zoom_meeting_id,
          zoom_password,
          cancellation_policy,
          notes,
          access_token,
          patient:patients!sessions_patient_id_fkey(first_name, last_name),
          professional:profiles!sessions_professional_id_fkey(first_name, last_name),
          location:center_locations!sessions_location_id_fkey(name, street, number_details, city, postal_code),
          center:centers!sessions_center_id_fkey(name, address, address_details, city, postal_code)
        `)
        .eq('access_token', token)
        .setHeader('x-session-token', token)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Session not found');
      
      // If no location or center data (due to RLS), fetch via secure function
      let centerFallback = null;
      if (!data.location && !data.center) {
        const { data: fallbackData } = await supabase
          .rpc('get_center_address_for_session_token')
          .setHeader('x-session-token', token);
        
        if (fallbackData && fallbackData.length > 0) {
          centerFallback = fallbackData[0];
        }
      }
      
      return { ...data, centerFallback } as PublicSessionData;
    },
    enabled: !!token,
    retry: false,
  });
}

export function useUpdatePublicSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      token, 
      status,
      cancellation_reason 
    }: { 
      token: string; 
      status: string;
      cancellation_reason?: string;
    }) => {
      const updateData: Record<string, string> = { status };
      if (cancellation_reason) {
        updateData.cancellation_reason = cancellation_reason;
      }

      const { data, error } = await supabase
        .from('sessions')
        .update(updateData)
        .eq('access_token', token)
        .setHeader('x-session-token', token)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['public-session', variables.token] });
      
      const messages: Record<string, string> = {
        confirmed: '¡Tu cita ha sido confirmada!',
        cancelled: 'Tu cita ha sido cancelada.',
        reschedule_requested: 'Solicitud de reprogramación enviada.',
      };
      
      toast.success(messages[variables.status] || 'Estado actualizado');
    },
    onError: (error) => {
      console.error('Error updating session:', error);
      toast.error('Error', {
        description: 'No se pudo actualizar la cita. Inténtalo de nuevo.',
      });
    },
  });
}

// Hook for getting availability and rescheduling a session
export interface PublicLocation {
  id: string;
  name: string;
  location_type: 'in_person' | 'online' | null;
  street: string | null;
  number_details: string | null;
  city: string | null;
  postal_code: string | null;
}

export interface CancellationPolicyPreview {
  hasSignedPolicy: boolean;
  applies: boolean;
  amount: number;
  basePrice: number;
  percentage: number;
  concept: string | null;
  message: string;
}

export function usePublicSessionReschedule(token: string | undefined) {
  const queryClient = useQueryClient();
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [availableDaysLoading, setAvailableDaysLoading] = useState(false);
  const [maxDays, setMaxDays] = useState(30);
  const [slotDuration, setSlotDuration] = useState(60);
  const [locations, setLocations] = useState<PublicLocation[]>([]);
  const [originalLocationId, setOriginalLocationId] = useState<string | null>(null);
  const [cancellationPolicyPreview, setCancellationPolicyPreview] = useState<CancellationPolicyPreview | null>(null);
  const [cancellationPolicyPreviewLoading, setCancellationPolicyPreviewLoading] = useState(false);

  const getLocations = useCallback(async () => {
    if (!token) return;
    try {
      const { data, error } = await supabase.functions.invoke('public-session-reschedule', {
        body: { action: 'get-locations', token }
      });
      if (error) throw error;
      setLocations(data?.locations || []);
      setOriginalLocationId(data?.originalLocationId || null);
    } catch (error) {
      console.error('Error fetching locations:', error);
      setLocations([]);
    }
  }, [token]);

  const getAvailableDays = useCallback(async (locationId?: string) => {
    if (!token) return;

    setAvailableDaysLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-session-reschedule', {
        body: { action: 'get-available-days', token, locationId }
      });

      if (error) throw error;
      
      setAvailableDays(data.availableDays || []);
      setMaxDays(data.maxDays || 30);
      setSlotDuration(data.slotDuration || 60);
    } catch (error) {
      console.error('Error fetching available days:', error);
      setAvailableDays([]);
    } finally {
      setAvailableDaysLoading(false);
    }
  }, [token]);

  const getAvailability = useCallback(async (date: string, locationId?: string) => {
    if (!token) return;
    
    setSlotsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-session-reschedule', {
        body: { action: 'get-availability', token, date, locationId }
      });

      if (error) throw error;
      
      setSlots(data.slots || []);
      setMaxDays(data.maxDays || 30);
      setSlotDuration(data.slotDuration || 60);
    } catch (error) {
      console.error('Error fetching availability:', error);
      toast.error('Error al cargar disponibilidad');
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [token]);

  const getCancellationPolicyPreview = useCallback(async () => {
    if (!token) return null;

    setCancellationPolicyPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-session-reschedule', {
        body: { action: 'get-cancellation-preview', token }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const preview = data as CancellationPolicyPreview;
      setCancellationPolicyPreview(preview);
      return preview;
    } catch (error) {
      console.error('Error fetching cancellation policy preview:', error);
      setCancellationPolicyPreview(null);
      return null;
    } finally {
      setCancellationPolicyPreviewLoading(false);
    }
  }, [token]);

  const rescheduleMutation = useMutation({
    mutationFn: async ({ 
      newDate, 
      newStartTime, 
      newEndTime,
      newLocationId,
    }: { 
      newDate: string; 
      newStartTime: string; 
      newEndTime: string;
      newLocationId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('public-session-reschedule', {
        body: { 
          action: 'reschedule', 
          token, 
          newDate, 
          newStartTime, 
          newEndTime,
          newLocationId,
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['public-session', token] });
      toast.success(data.message || '¡Cita reprogramada!');
    },
    onError: (error: Error) => {
      console.error('Error rescheduling session:', error);
      if (error.message.includes('no longer available')) {
        toast.error('El horario seleccionado ya no está disponible');
      } else {
        toast.error('Error al reprogramar la cita');
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ 
      cancellation_reason 
    }: { 
      cancellation_reason?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('public-session-reschedule', {
        body: { 
          action: 'cancel', 
          token, 
          cancellation_reason 
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['public-session', token] });
      toast.success(data.message || 'Cita cancelada');
    },
    onError: (error: Error) => {
      console.error('Error cancelling session:', error);
      toast.error(error.message || 'Error al cancelar la cita');
    },
  });

  return {
    slots,
    slotsLoading,
    availableDays,
    availableDaysLoading,
    maxDays,
    slotDuration,
    locations,
    originalLocationId,
    cancellationPolicyPreview,
    cancellationPolicyPreviewLoading,
    getLocations,
    getAvailableDays,
    getAvailability,
    getCancellationPolicyPreview,
    reschedule: rescheduleMutation.mutate,
    isRescheduling: rescheduleMutation.isPending,
    cancelSession: cancelMutation.mutate,
    isCancelling: cancelMutation.isPending,
  };
}
