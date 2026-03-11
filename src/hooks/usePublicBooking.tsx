import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CenterConfig {
  centerId: string;
  name: string;
  logoUrl: string | null;
  timezone: string;
  requireApproval: boolean;
  allowProfessionalSelection: boolean;
  defaultProfessionalId: string | null;
  slotDuration: number;
  maxDaysAhead: number;
  agendaClosed: boolean;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  default_price: number | null;
  color: string | null;
  is_first_consultation: boolean | null;
}

interface Location {
  id: string;
  name: string;
  location_type: string;
  street: string | null;
  city: string | null;
}

interface Professional {
  id: string;
  first_name: string;
  last_name: string;
  specialty: string | null;
  avatar_url: string | null;
}

interface Slot {
  startTime: string;
  endTime: string;
  isOptimal?: boolean;
}

interface DayAvailability {
  date: string;
  availableCount: number;
}

interface BookingResult {
  success: boolean;
  session: any;
  bookingToken: string;
  manageUrl: string;
  message: string;
}

interface BookingDetails {
  booking: any;
  centerName: string;
  centerSlug: string;
}

interface IntakeRequestData {
  requestType: 'waitlist' | 'referral';
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  modality?: 'online' | 'presencial';
  city?: string;
  notes?: string;
  // Privacy acceptance fields
  privacyAccepted: boolean;
  privacyPolicyUrl: string;
  // Referral wizard fields (optional)
  specialty?: string;
  referralContext?: Record<string, any>;
  selectedPartnerId?: string;
  recommendedPartnerIds?: string[];
}

interface ReferralSpecialty {
  id: string;
  name: string;
}

interface ReferralFilters {
  specialties: ReferralSpecialty[];
  provinces: string[];
  cities: string[];
}

interface ReferralPartner {
  id: string;
  name: string;
  surname: string | null;
  publicName: string;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  modalities: string[];
  provinces: string[] | null;
  cities: string[] | null;
  specialties: string[] | null;
}

export type { IntakeRequestData, ReferralFilters, ReferralPartner, ReferralSpecialty };

export function usePublicBooking(centerSlug: string) {
  const [config, setConfig] = useState<CenterConfig | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [allowProfessionalSelection, setAllowProfessionalSelection] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  const invoke = useCallback(async (action: string, params: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('public-booking', {
      body: { action, centerSlug, ...params }
    });
    
    if (error) throw new Error(error.message);
    if (data?.error) {
      if (data.disabled) setDisabled(true);
      throw new Error(data.error);
    }
    return data;
  }, [centerSlug]);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke('get-config');
      setConfig(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  const fetchServices = useCallback(async () => {
    try {
      const data = await invoke('list-services');
      setServices(data.services || []);
      return data.services;
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, [invoke]);

  const fetchLocations = useCallback(async () => {
    try {
      const data = await invoke('list-locations');
      setLocations(data.locations || []);
      return data.locations;
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, [invoke]);

  const fetchProfessionals = useCallback(async () => {
    try {
      const data = await invoke('list-professionals');
      setProfessionals(data.professionals || []);
      setAllowProfessionalSelection(data.allowSelection || false);
      return data.professionals;
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, [invoke]);

  const getAvailability = useCallback(async (
    date: string, 
    sessionTypeId: string, 
    locationId: string,
    professionalId?: string
  ): Promise<{ slots: Slot[]; serviceDuration: number }> => {
    try {
      const data = await invoke('get-availability', { date, sessionTypeId, locationId, professionalId });
      return { slots: data.slots || [], serviceDuration: data.serviceDuration };
    } catch (err: any) {
      setError(err.message);
      return { slots: [], serviceDuration: 60 };
    }
  }, [invoke]);

  const getMonthAvailability = useCallback(async (
    month: string,
    sessionTypeId: string,
    locationId: string,
    professionalId?: string
  ): Promise<DayAvailability[]> => {
    try {
      const data = await invoke('get-availability-month', { month, sessionTypeId, locationId, professionalId });
      return data?.days || [];
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, [invoke]);

  const createBooking = useCallback(async (params: {
    sessionTypeId: string;
    locationId: string;
    professionalId?: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    patient: { firstName: string; lastName: string; email: string; phone?: string };
    acceptPrivacy: boolean;
    notes?: string;
  }): Promise<BookingResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke('create-booking', params);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  const getBooking = useCallback(async (bookingToken: string): Promise<BookingDetails | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('public-booking', {
        body: { action: 'get-booking', bookingToken }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelBooking = useCallback(async (bookingToken: string, reason?: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('public-booking', {
        body: { action: 'cancel-booking', bookingToken, reason }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data.success;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const rescheduleBooking = useCallback(async (
    bookingToken: string, 
    newDate: string, 
    newStartTime: string, 
    newEndTime: string
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('public-booking', {
        body: { action: 'reschedule-booking', bookingToken, newDate, newStartTime, newEndTime }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data.success;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
    setLoading(false);
    }
  }, []);

  const submitIntakeRequest = useCallback(async (data: IntakeRequestData): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke('submit-intake-request', {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        requestType: data.requestType,
        modality: data.modality,
        city: data.city,
        notes: data.notes,
        // Privacy fields
        privacyAccepted: data.privacyAccepted,
        privacyPolicyUrl: data.privacyPolicyUrl,
        // Referral wizard fields
        specialty: data.specialty,
        referralContext: data.referralContext,
        selectedPartnerId: data.selectedPartnerId,
        recommendedPartnerIds: data.recommendedPartnerIds,
      });
      return result?.success ?? false;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  const listReferralFilters = useCallback(async (): Promise<ReferralFilters> => {
    try {
      const data = await invoke('list-referral-filters');
      return {
        specialties: data.specialties || [],
        provinces: data.provinces || [],
        cities: data.cities || []
      };
    } catch (err: any) {
      console.error('[listReferralFilters] Error:', err);
      return { specialties: [], provinces: [], cities: [] };
    }
  }, [invoke]);

  const getReferralRecommendations = useCallback(async (
    modality: string,
    specialty: string,
    province?: string,
    city?: string
  ): Promise<ReferralPartner[]> => {
    try {
      const data = await invoke('get-referral-recommendations', { modality, specialty, province, city });
      return data.partners || [];
    } catch (err: any) {
      console.error('[getReferralRecommendations] Error:', err);
      return [];
    }
  }, [invoke]);

  return {
    config,
    services,
    locations,
    professionals,
    allowProfessionalSelection,
    loading,
    error,
    disabled,
    fetchConfig,
    fetchServices,
    fetchLocations,
    fetchProfessionals,
    getAvailability,
    getMonthAvailability,
    createBooking,
    getBooking,
    cancelBooking,
    rescheduleBooking,
    submitIntakeRequest,
    listReferralFilters,
    getReferralRecommendations
  };
}
