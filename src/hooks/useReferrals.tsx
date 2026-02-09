import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from './useCenter';
import { toast } from 'sonner';

export interface ReferralSpecialty {
  id: string;
  center_id: string;
  name: string;
  active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface ReferralPartner {
  id: string;
  center_id: string;
  name: string;
  surname: string | null;
  public_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  modality: string[];
  provinces: string[] | null;
  cities: string[] | null;
  specialties: string[] | null;
  active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export type ReferralSpecialtyInput = Omit<ReferralSpecialty, 'id' | 'center_id' | 'created_at' | 'updated_at'>;
export type ReferralPartnerInput = Omit<ReferralPartner, 'id' | 'center_id' | 'created_at' | 'updated_at'>;

export function useReferrals() {
  const { centerId } = useCenter();
  const queryClient = useQueryClient();

  // ===== SPECIALTIES =====
  const { data: specialties = [], isLoading: specialtiesLoading } = useQuery({
    queryKey: ['referral-specialties', centerId],
    queryFn: async () => {
      if (!centerId) return [];
      const { data, error } = await supabase
        .from('referral_specialties')
        .select('*')
        .eq('center_id', centerId)
        .order('priority', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as ReferralSpecialty[];
    },
    enabled: !!centerId,
  });

  const createSpecialty = useMutation({
    mutationFn: async (input: ReferralSpecialtyInput) => {
      if (!centerId) throw new Error('No center ID');
      const { data, error } = await supabase
        .from('referral_specialties')
        .insert({ ...input, center_id: centerId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-specialties', centerId] });
      toast.success('Especialidad creada');
    },
    onError: (e) => toast.error('Error: ' + e.message),
  });

  const updateSpecialty = useMutation({
    mutationFn: async ({ id, ...input }: Partial<ReferralSpecialtyInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('referral_specialties')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-specialties', centerId] });
      toast.success('Especialidad actualizada');
    },
    onError: (e) => toast.error('Error: ' + e.message),
  });

  const deleteSpecialty = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('referral_specialties')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-specialties', centerId] });
      toast.success('Especialidad eliminada');
    },
    onError: (e) => toast.error('Error: ' + e.message),
  });

  // ===== PARTNERS =====
  const { data: partners = [], isLoading: partnersLoading } = useQuery({
    queryKey: ['referral-partners', centerId],
    queryFn: async () => {
      if (!centerId) return [];
      const { data, error } = await supabase
        .from('referral_partners')
        .select('*')
        .eq('center_id', centerId)
        .order('priority', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as ReferralPartner[];
    },
    enabled: !!centerId,
  });

  const createPartner = useMutation({
    mutationFn: async (input: ReferralPartnerInput) => {
      if (!centerId) throw new Error('No center ID');
      const { data, error } = await supabase
        .from('referral_partners')
        .insert({ ...input, center_id: centerId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-partners', centerId] });
      toast.success('Profesional creado');
    },
    onError: (e) => toast.error('Error: ' + e.message),
  });

  const updatePartner = useMutation({
    mutationFn: async ({ id, ...input }: Partial<ReferralPartnerInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('referral_partners')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-partners', centerId] });
      toast.success('Profesional actualizado');
    },
    onError: (e) => toast.error('Error: ' + e.message),
  });

  const deletePartner = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('referral_partners')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-partners', centerId] });
      toast.success('Profesional eliminado');
    },
    onError: (e) => toast.error('Error: ' + e.message),
  });

  return {
    // Specialties
    specialties,
    specialtiesLoading,
    createSpecialty,
    updateSpecialty,
    deleteSpecialty,
    // Partners
    partners,
    partnersLoading,
    createPartner,
    updatePartner,
    deletePartner,
  };
}
