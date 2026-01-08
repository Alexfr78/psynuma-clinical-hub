import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SessionData {
  id?: string;
  professional_id: string;
  patient_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_modality?: string;
  video_provider?: string;
  session_type?: string;
  price?: number;
}

interface PatientData {
  first_name: string;
  last_name: string;
  email?: string | null;
}

interface IntegrationResult {
  video_call_link?: string;
  video_provider?: string;
  google_calendar_event_id?: string;
  stripe_checkout_url?: string;
  stripe_payment_status?: string;
}

export async function handleSessionIntegrations(
  session: SessionData,
  patient: PatientData,
  professionalIntegrations: any,
  oauthConnections: any[]
): Promise<IntegrationResult> {
  const result: IntegrationResult = {};
  const patientName = `${patient.first_name} ${patient.last_name}`;
  
  // Check if video modality
  const isVideoSession = session.session_modality === 'video' || 
                         session.video_provider === 'zoom' || 
                         session.video_provider === 'google_meet';

  // Get provider connections
  const googleConnection = oauthConnections?.find(c => c.provider === 'google');
  const zoomConnection = oauthConnections?.find(c => c.provider === 'zoom');
  const stripeConnection = oauthConnections?.find(c => c.provider === 'stripe');

  // Determine video provider to use
  let videoProvider: 'zoom' | 'google_meet' | null = null;
  
  if (isVideoSession) {
    if (session.video_provider === 'zoom' || 
        (professionalIntegrations?.default_video_provider === 'zoom' && !session.video_provider)) {
      if (professionalIntegrations?.zoom_enabled && zoomConnection?.access_token) {
        videoProvider = 'zoom';
      }
    } else if (session.video_provider === 'google_meet' || 
               (professionalIntegrations?.default_video_provider === 'google_meet' && !session.video_provider)) {
      if (professionalIntegrations?.google_meet_enabled && googleConnection?.access_token) {
        videoProvider = 'google_meet';
      }
    }
  }

  // Create Zoom meeting if needed
  if (videoProvider === 'zoom') {
    try {
      console.log('Creating Zoom meeting...');
      const { data, error } = await supabase.functions.invoke('create-zoom-meeting', {
        body: {
          professional_id: session.professional_id,
          session_date: session.session_date,
          start_time: session.start_time,
          end_time: session.end_time,
          topic: `Sesión de ${session.session_type || 'psicología'}`,
          patient_name: patientName,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      result.video_call_link = data.join_url;
      result.video_provider = 'zoom';
      console.log('Zoom meeting created:', data.meeting_id);
    } catch (err) {
      console.error('Error creating Zoom meeting:', err);
      toast.error('No se pudo crear la reunión de Zoom');
    }
  }

  // Create Google Calendar event (with or without Meet)
  if (professionalIntegrations?.google_calendar_enabled && googleConnection?.access_token) {
    const includeMeet = videoProvider === 'google_meet';
    
    try {
      console.log('Creating Google Calendar event with patient_id:', session.patient_id);
      const { data, error } = await supabase.functions.invoke('create-google-calendar-event', {
        body: {
          professional_id: session.professional_id,
          session_id: session.id,
          session_date: session.session_date,
          start_time: session.start_time,
          end_time: session.end_time,
          patient_id: session.patient_id, // Pass patient_id for format templates
          patient_email: patient.email,
          include_meet: includeMeet,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      result.google_calendar_event_id = data.event_id;
      
      if (includeMeet && data.meet_link) {
        result.video_call_link = data.meet_link;
        result.video_provider = 'google_meet';
      }
      
      console.log('Google Calendar event created:', data.event_id);
    } catch (err) {
      console.error('Error creating Google Calendar event:', err);
      toast.error('No se pudo sincronizar con Google Calendar');
    }
  }

  return result;
}

// Handle Stripe payment based on payment mode
export async function handleStripePayment(
  session: SessionData & { id: string; payment_mode?: string | null },
  patient: PatientData,
  professionalIntegrations: any,
  oauthConnections: any[]
): Promise<{ checkout_url?: string; payment_status?: string }> {
  const stripeConnection = oauthConnections?.find(c => c.provider === 'stripe');
  
  if (!professionalIntegrations?.stripe_enabled || 
      !stripeConnection?.stripe_account_id ||
      stripeConnection?.stripe_account_status !== 'active') {
    return {};
  }

  // Use session-specific payment mode, or fall back to professional's default
  const paymentMode = session.payment_mode || professionalIntegrations.stripe_payment_mode || 'post_pay';
  
  // Only create checkout for required_now mode during session creation
  if (paymentMode === 'required_now') {
    try {
      console.log('Creating Stripe checkout (required_now mode)...');
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: {
          professional_id: session.professional_id,
          session_id: session.id,
          patient_id: session.patient_id,
          patient_email: patient.email,
          patient_name: `${patient.first_name} ${patient.last_name}`,
          amount: session.price || 0,
          session_type: session.session_type,
          session_date: session.session_date,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      console.log('Stripe checkout created');
      return {
        checkout_url: data.checkout_url,
        payment_status: 'pending',
      };
    } catch (err) {
      console.error('Error creating Stripe checkout:', err);
      toast.error('No se pudo crear el enlace de pago');
      return {};
    }
  } else if (paymentMode === 'scheduled_before') {
    // For scheduled mode, we'll create checkout later via a scheduled job
    // Mark session with the payment mode for later processing
    return { payment_status: 'scheduled' };
  } else {
    // post_pay mode - no checkout needed now
    return { payment_status: 'post_pay' };
  }
}

// Create checkout session on demand
export async function createStripeCheckout(
  sessionId: string,
  professionalId: string,
  patientId: string,
  patientEmail: string | null,
  patientName: string,
  amount: number,
  sessionType: string,
  sessionDate: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
      body: {
        professional_id: professionalId,
        session_id: sessionId,
        patient_id: patientId,
        patient_email: patientEmail,
        patient_name: patientName,
        amount,
        session_type: sessionType,
        session_date: sessionDate,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data.checkout_url;
  } catch (err) {
    console.error('Error creating Stripe checkout:', err);
    toast.error('No se pudo crear el enlace de pago');
    return null;
  }
}

export async function handleSessionUpdate(
  sessionId: string,
  professionalId: string,
  googleEventId: string | null,
  updates: {
    session_date?: string;
    start_time?: string;
    end_time?: string;
    title?: string;
    status?: string;
  }
): Promise<void> {
  if (!googleEventId) return;

  try {
    const { data, error } = await supabase.functions.invoke('update-google-calendar-event', {
      body: {
        professional_id: professionalId,
        event_id: googleEventId,
        // CRITICAL: Always send psycma_session_id to mark event as Psycma-created
        // This prevents the sync from re-importing this event as an external block
        psycma_session_id: sessionId,
        ...updates,
      },
    });

    if (error || data?.success === false) {
      const msg = (data?.message || data?.error || error?.message) as string | undefined;
      console.error('Error updating Google Calendar event:', error || data);
      toast.error(msg || 'No se pudo sincronizar con Google Calendar');
      return;
    }

    console.log('Google Calendar event updated with psycma_session_id marker');
  } catch (err) {
    console.error('Error updating Google Calendar event:', err);
  }
}

export async function handleSessionCancellation(
  professionalId: string,
  googleEventId: string | null,
  videoProvider: string | null,
  videoCallLink: string | null
): Promise<void> {
  // Cancel Google Calendar event
  if (googleEventId) {
    try {
      const { data, error } = await supabase.functions.invoke('update-google-calendar-event', {
        body: {
          professional_id: professionalId,
          event_id: googleEventId,
          status: 'cancelled',
        },
      });

      if (error || data?.success === false) {
        const msg = (data?.message || data?.error || error?.message) as string | undefined;
        console.error('Error cancelling Google Calendar event:', error || data);
        toast.error(msg || 'No se pudo cancelar el evento en Google Calendar');
      } else {
        console.log('Google Calendar event cancelled');
      }
    } catch (err) {
      console.error('Error cancelling Google Calendar event:', err);
    }
  }

  // Delete Zoom meeting if applicable
  if (videoProvider === 'zoom' && videoCallLink) {
    const meetingIdMatch = videoCallLink.match(/\/j\/(\d+)/);
    if (meetingIdMatch) {
      try {
        await supabase.functions.invoke('delete-zoom-meeting', {
          body: {
            professional_id: professionalId,
            meeting_id: meetingIdMatch[1],
          },
        });
        console.log('Zoom meeting deleted');
      } catch (err) {
        console.error('Error deleting Zoom meeting:', err);
      }
    }
  }
}
