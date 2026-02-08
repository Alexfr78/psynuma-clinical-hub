import { useMemo, useCallback } from 'react';
import { useCenter } from './useCenter';
import { useWasender } from './useWasender';
import { supabase } from '@/integrations/supabase/client';
import { generateWhatsAppUniversalLink } from '@/lib/whatsapp';
import { toast } from 'sonner';

export type WhatsAppDeliveryMethod = 'wasender' | 'meta_api' | 'manual';

export interface WhatsAppDeliveryResult {
  autoSent: boolean;
  method: WhatsAppDeliveryMethod;
  error?: string;
}

export function useWhatsAppDelivery() {
  const { center } = useCenter();
  const { session: wasenderSession, isConnected: wasenderConnected } = useWasender();

  // Determine the best available delivery method based on priority
  const deliveryMethod = useMemo((): WhatsAppDeliveryMethod => {
    // Priority 1: WasenderAPI if enabled AND connected
    if (center?.wasender_enabled && wasenderConnected && !center?.wasender_emergency_stop) {
      return 'wasender';
    }
    // Priority 2: Meta Business API if configured
    if (center?.whatsapp_send_method === 'api' && center?.whatsapp_access_token) {
      return 'meta_api';
    }
    // Fallback: Manual links
    return 'manual';
  }, [center, wasenderConnected]);

  // Whether the current method can send automatically (no user interaction needed)
  const isAutomatic = useMemo(() => {
    return deliveryMethod === 'wasender' || deliveryMethod === 'meta_api';
  }, [deliveryMethod]);

  // Get a human-readable label for the current method
  const methodLabel = useMemo(() => {
    switch (deliveryMethod) {
      case 'wasender':
        return 'Automático (WasenderAPI)';
      case 'meta_api':
        return 'Automático (Meta API)';
      case 'manual':
        return 'Enlace manual';
    }
  }, [deliveryMethod]);

  // Status info for UI display
  const statusInfo = useMemo(() => {
    if (center?.wasender_enabled) {
      if (center?.wasender_emergency_stop) {
        return { status: 'stopped', label: 'Pausado', variant: 'destructive' as const };
      }
      if (wasenderConnected) {
        return { status: 'connected', label: 'Conectado', variant: 'default' as const };
      }
      return { status: 'disconnected', label: 'Desconectado', variant: 'secondary' as const };
    }
    if (center?.whatsapp_send_method === 'api') {
      return { status: 'api', label: 'Meta API', variant: 'default' as const };
    }
    return { status: 'manual', label: 'Manual', variant: 'outline' as const };
  }, [center, wasenderConnected]);

  // Send message via WasenderAPI
  const sendViaWasender = useCallback(async (params: {
    phone: string;
    message: string;
    patientId?: string;
    sessionId?: string;
    messageType?: string;
  }): Promise<WhatsAppDeliveryResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('wasender-send-message', {
        body: {
          phone: params.phone,
          message: params.message,
          patient_id: params.patientId,
          session_id: params.sessionId,
          message_type: params.messageType || 'notification',
        },
      });

      if (error) {
        console.error('[WhatsAppDelivery] WasenderAPI error:', error);
        return { autoSent: false, method: 'wasender', error: error.message };
      }

      if (!data?.success) {
        const errorMsg = data?.error || 'Error desconocido';
        console.error('[WhatsAppDelivery] WasenderAPI failed:', errorMsg);
        return { autoSent: false, method: 'wasender', error: errorMsg };
      }

      return { autoSent: true, method: 'wasender' };
    } catch (err) {
      console.error('[WhatsAppDelivery] Exception:', err);
      return { autoSent: false, method: 'wasender', error: String(err) };
    }
  }, []);

  // Send message via Meta Business API (existing flow via notifications table)
  const sendViaMetaApi = useCallback(async (params: {
    phone: string;
    message: string;
    patientId: string;
    sessionId?: string;
    centerId: string;
  }): Promise<WhatsAppDeliveryResult> => {
    try {
      // Create notification record
      const { data: notification, error: insertError } = await supabase
        .from('notifications')
        .insert({
          center_id: params.centerId,
          patient_id: params.patientId,
          session_id: params.sessionId || null,
          type: 'whatsapp',
          recipient: params.phone,
          message: params.message,
          status: 'pending',
        })
        .select()
        .single();

      if (insertError || !notification) {
        return { autoSent: false, method: 'meta_api', error: insertError?.message };
      }

      // Invoke send-notification edge function
      const { error: sendError } = await supabase.functions.invoke('send-notification', {
        body: { notificationId: notification.id },
      });

      if (sendError) {
        return { autoSent: false, method: 'meta_api', error: sendError.message };
      }

      return { autoSent: true, method: 'meta_api' };
    } catch (err) {
      console.error('[WhatsAppDelivery] Meta API exception:', err);
      return { autoSent: false, method: 'meta_api', error: String(err) };
    }
  }, []);

  // Get manual link for fallback
  const getManualLink = useCallback((phone: string, message: string): string => {
    return generateWhatsAppUniversalLink(phone, message);
  }, []);

  // Main send function that automatically uses the best available method
  const sendWhatsApp = useCallback(async (params: {
    phone: string;
    message: string;
    patientId: string;
    patientName: string;
    sessionId?: string;
    centerId: string;
    messageType?: string;
  }): Promise<{
    result: WhatsAppDeliveryResult;
    manualLink?: string;
  }> => {
    console.log('[WhatsAppDelivery] Sending via method:', deliveryMethod);

    // Validate phone
    if (!params.phone) {
      toast.warning('Sin teléfono', {
        description: `${params.patientName} no tiene teléfono registrado.`,
      });
      return {
        result: { autoSent: false, method: 'manual', error: 'No phone number' },
      };
    }

    if (deliveryMethod === 'wasender') {
      const result = await sendViaWasender({
        phone: params.phone,
        message: params.message,
        patientId: params.patientId,
        sessionId: params.sessionId,
        messageType: params.messageType,
      });

      if (result.autoSent) {
        toast.success('WhatsApp enviado', {
          description: `Mensaje enviado a ${params.patientName}.`,
        });
        return { result };
      } else {
        // Fallback to manual if WasenderAPI fails
        console.warn('[WhatsAppDelivery] WasenderAPI failed, falling back to manual');
        toast.warning('Envío automático falló', {
          description: 'Se abrirá el enlace manual.',
        });
        return {
          result: { autoSent: false, method: 'manual' },
          manualLink: getManualLink(params.phone, params.message),
        };
      }
    }

    if (deliveryMethod === 'meta_api') {
      const result = await sendViaMetaApi({
        phone: params.phone,
        message: params.message,
        patientId: params.patientId,
        sessionId: params.sessionId,
        centerId: params.centerId,
      });

      if (result.autoSent) {
        toast.success('WhatsApp enviado', {
          description: `Mensaje enviado a ${params.patientName}.`,
        });
        return { result };
      } else {
        // Fallback to manual
        return {
          result: { autoSent: false, method: 'manual' },
          manualLink: getManualLink(params.phone, params.message),
        };
      }
    }

    // Manual mode - return link for dialog
    return {
      result: { autoSent: false, method: 'manual' },
      manualLink: getManualLink(params.phone, params.message),
    };
  }, [deliveryMethod, sendViaWasender, sendViaMetaApi, getManualLink]);

  return {
    // Current delivery method
    deliveryMethod,
    isAutomatic,
    methodLabel,
    statusInfo,
    
    // WasenderAPI specific status
    isWasenderEnabled: center?.wasender_enabled ?? false,
    isWasenderConnected: wasenderConnected,
    wasenderEmergencyStop: center?.wasender_emergency_stop ?? false,
    
    // Send functions
    sendWhatsApp,
    sendViaWasender,
    sendViaMetaApi,
    getManualLink,
  };
}
