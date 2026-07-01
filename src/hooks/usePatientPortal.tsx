import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Center {
  name: string;
  slug: string;
}

interface Session {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  session_type: string;
  session_modality: string;
  notes: string | null;
  professional: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  location: {
    id: string;
    name: string;
    street: string;
    city: string;
    location_type?: string;
  } | null;
}

interface PortalState {
  isAuthenticated: boolean;
  isLoading: boolean;
  patient: Patient | null;
  center: Center | null;
  sessionToken: string | null;
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

export function usePatientPortal(centerSlug?: string) {
  const [state, setState] = useState<PortalState>({
    isAuthenticated: false,
    isLoading: true,
    patient: null,
    center: null,
    sessionToken: null,
  });

  const [sessions, setSessions] = useState<{ upcoming: Session[]; past: Session[] }>({
    upcoming: [],
    past: [],
  });
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Check for stored session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(`portal_session_${centerSlug}`);
    if (storedToken) {
      validateSession(storedToken);
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [centerSlug]);

  const validateSession = async (token: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-auth', {
        body: { action: 'validate-session', sessionToken: token },
      });

      if (error || !data?.valid) {
        localStorage.removeItem(`portal_session_${centerSlug}`);
        setState({
          isAuthenticated: false,
          isLoading: false,
          patient: null,
          center: null,
          sessionToken: null,
        });
        return;
      }

      setState({
        isAuthenticated: true,
        isLoading: false,
        patient: data.patient,
        center: data.center,
        sessionToken: token,
      });
    } catch (error) {
      console.error('Error validating session:', error);
      localStorage.removeItem(`portal_session_${centerSlug}`);
      setState({
        isAuthenticated: false,
        isLoading: false,
        patient: null,
        center: null,
        sessionToken: null,
      });
    }
  };

  const verifyMagicLink = async (token: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-auth', {
        body: { action: 'verify', token },
      });

      if (error || !data?.success) {
        return { success: false, error: data?.error || 'Error de autenticación' };
      }

      // Store session token
      localStorage.setItem(`portal_session_${centerSlug}`, data.sessionToken);
      
      setState({
        isAuthenticated: true,
        isLoading: false,
        patient: data.patient,
        center: data.center,
        sessionToken: data.sessionToken,
      });

      return { success: true };
    } catch (error) {
      console.error('Error verifying magic link:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const sendMagicLink = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-auth', {
        body: { action: 'send-link', email, centerSlug },
      });

      if (error) {
        return { success: false, error: 'Error al enviar el enlace' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error sending magic link:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const register = async (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    dateOfBirth?: string;
  }): Promise<{ success: boolean; error?: string; token?: string }> => {
    try {
      const { data: result, error } = await supabase.functions.invoke('patient-portal-register', {
        body: { centerSlug, ...data },
      });

      if (error || !result?.success) {
        return { success: false, error: result?.error || 'Error al crear la cuenta' };
      }

      return { success: true, token: result.token };
    } catch (error) {
      console.error('Error registering:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const logout = () => {
    localStorage.removeItem(`portal_session_${centerSlug}`);
    setState({
      isAuthenticated: false,
      isLoading: false,
      patient: null,
      center: null,
      sessionToken: null,
    });
    setSessions({ upcoming: [], past: [] });
  };

  const fetchSessions = useCallback(async () => {
    if (!state.sessionToken) return;

    setSessionsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-sessions', {
        body: { action: 'list', sessionToken: state.sessionToken },
      });

      if (error) {
        console.error('Error fetching sessions:', error);
        return;
      }

      setSessions({
        upcoming: data?.upcoming || [],
        past: data?.past || [],
      });
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setSessionsLoading(false);
    }
  }, [state.sessionToken]);

  const createSession = async (params: {
    professionalId?: string;
    sessionTypeId: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    locationId: string;
  }): Promise<{ success: boolean; error?: string; message?: string }> => {
    if (!state.sessionToken) {
      return { success: false, error: 'Sesión no válida' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-sessions', {
        body: { action: 'create', sessionToken: state.sessionToken, ...params },
      });

      if (error || !data?.success) {
        return { success: false, error: data?.error || 'Error al crear la cita' };
      }

      await fetchSessions();
      return { success: true, message: data.message };
    } catch (error) {
      console.error('Error creating session:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const cancelSession = async (sessionId: string, reason?: string): Promise<{ success: boolean; error?: string }> => {
    if (!state.sessionToken) {
      return { success: false, error: 'Sesión no válida' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-sessions', {
        body: { action: 'cancel', sessionToken: state.sessionToken, sessionId, reason },
      });

      if (error || !data?.success) {
        return { success: false, error: data?.error || 'Error al cancelar la cita' };
      }

      await fetchSessions();
      return { success: true };
    } catch (error) {
      console.error('Error cancelling session:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const getCancellationPreview = async (sessionId: string): Promise<CancellationPolicyPreview | null> => {
    if (!state.sessionToken) return null;

    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-sessions', {
        body: { action: 'get-cancellation-preview', sessionToken: state.sessionToken, sessionId },
      });

      if (error || data?.error) {
        console.error('Error fetching cancellation preview:', error || data?.error);
        return null;
      }

      return data as CancellationPolicyPreview;
    } catch (error) {
      console.error('Error fetching cancellation preview:', error);
      return null;
    }
  };

  const confirmSession = async (sessionId: string): Promise<{ success: boolean; error?: string }> => {
    if (!state.sessionToken) {
      return { success: false, error: 'Sesión no válida' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-sessions', {
        body: { action: 'confirm', sessionToken: state.sessionToken, sessionId },
      });

      if (error || !data?.success) {
        return { success: false, error: data?.error || 'Error al confirmar la cita' };
      }

      await fetchSessions();
      return { success: true };
    } catch (error) {
      console.error('Error confirming session:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const rescheduleSession = async (
    sessionId: string,
    newDate: string,
    newStartTime: string,
    newEndTime: string,
    newLocationId?: string,
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    if (!state.sessionToken) {
      return { success: false, error: 'Sesión no válida' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-sessions', {
        body: { action: 'reschedule', sessionToken: state.sessionToken, sessionId, newDate, newStartTime, newEndTime, newLocationId },
      });

      if (error || !data?.success) {
        return { success: false, error: data?.error || 'Error al reprogramar la cita' };
      }

      await fetchSessions();
      return { success: true, message: data.message };
    } catch (error) {
      console.error('Error rescheduling session:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const getAvailability = async (params: {
    professionalId?: string;
    date: string;
    sessionTypeId: string;
    locationId: string;
  }): Promise<{ slots: string[]; serviceDuration: number; step: number }> => {
    if (!state.sessionToken) {
      return { slots: [], serviceDuration: 60, step: 30 };
    }

    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-sessions', {
        body: { 
          action: 'get-availability', 
          sessionToken: state.sessionToken, 
          ...params 
        },
      });

      if (error) {
        console.error('Error getting availability:', error);
        return { slots: [], serviceDuration: 60, step: 30 };
      }

      return { 
        slots: data?.slots || [], 
        serviceDuration: data?.serviceDuration || 60,
        step: data?.step || 30 
      };
    } catch (error) {
      console.error('Error getting availability:', error);
      return { slots: [], serviceDuration: 60, step: 30 };
    }
  };

  const getMonthAvailability = async (params: {
    professionalId?: string;
    month: string;
    sessionTypeId: string;
    locationId: string;
  }): Promise<Record<string, number>> => {
    if (!state.sessionToken) return {};

    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-sessions', {
        body: {
          action: 'get-month-availability',
          sessionToken: state.sessionToken,
          ...params,
        },
      });

      if (error) {
        console.error('Error getting month availability:', error);
        return {};
      }

      return data?.availability || {};
    } catch (error) {
      console.error('Error getting month availability:', error);
      return {};
    }
  };

  return {
    ...state,
    sessions,
    sessionsLoading,
    verifyMagicLink,
    sendMagicLink,
    register,
    logout,
    fetchSessions,
    createSession,
    cancelSession,
    getCancellationPreview,
    confirmSession,
    rescheduleSession,
    getAvailability,
    getMonthAvailability,
  };
}
