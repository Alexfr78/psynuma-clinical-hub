import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from './useCenter';
import { toast } from 'sonner';

export interface InvoiceSeries {
  id: string;
  center_id: string;
  name: string;
  format: string;
  series_type: 'ordinary' | 'rectifying';
  invoice_type: 'simplified' | 'complete';
  next_number: number;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateInvoiceSeriesInput = Omit<InvoiceSeries, 'id' | 'center_id' | 'created_at' | 'updated_at' | 'is_archived'> & { is_archived?: boolean };
export type UpdateInvoiceSeriesInput = Partial<CreateInvoiceSeriesInput>;

export function useInvoiceSeriesUsage(seriesId?: string) {
  return useQuery({
    queryKey: ['invoice-series-usage', seriesId],
    queryFn: async () => {
      if (!seriesId) return 0;
      const { count, error } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('series_id', seriesId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!seriesId,
  });
}

export function useInvoiceSeries(showArchived: boolean = false) {
  const { centerId } = useCenter();
  const queryClient = useQueryClient();

  const { data: series = [], isLoading } = useQuery({
    queryKey: ['invoice-series', centerId, showArchived],
    queryFn: async () => {
      if (!centerId) return [];
      
      let query = supabase
        .from('invoice_series')
        .select('*')
        .eq('center_id', centerId)
        .order('series_type')
        .order('name');

      query = query.eq('is_archived', showArchived);


      const { data, error } = await query;

      if (error) throw error;
      return data as InvoiceSeries[];
    },
    enabled: !!centerId,
  });

  const createSeries = useMutation({
    mutationFn: async (input: CreateInvoiceSeriesInput) => {
      if (!centerId) throw new Error('No center ID');

      const { is_default: shouldSetDefault, ...seriesInput } = input;
      
      const { data, error } = await supabase
        .from('invoice_series')
        .insert({
          ...seriesInput,
          center_id: centerId,
          is_default: false,
        })
        .select()
        .single();

      if (error) throw error;

      if (shouldSetDefault) {
        const { data: defaultSeries, error: defaultError } = await supabase
          .rpc('set_default_invoice_series', { p_series_id: data.id })
          .single();
        if (defaultError) throw defaultError;
        return defaultSeries;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-series', centerId] });
      toast.success('Serie creada correctamente');
    },
    onError: (error) => {
      toast.error('Error al crear la serie: ' + error.message);
    },
  });

  const updateSeries = useMutation({
    mutationFn: async ({ id, ...updates }: UpdateInvoiceSeriesInput & { id: string }) => {
      const { data: current, error: currentError } = await supabase
        .from('invoice_series')
        .select('*')
        .eq('id', id)
        .single();

      if (currentError) throw currentError;

      const classificationChanges =
        (updates.invoice_type !== undefined && updates.invoice_type !== current.invoice_type)
        || (updates.series_type !== undefined && updates.series_type !== current.series_type);
      const shouldSetDefault = updates.is_default === true
        || (updates.is_default === undefined && current.is_default && classificationChanges);

      const { data, error } = await supabase
        .from('invoice_series')
        .update({
          ...updates,
          ...(shouldSetDefault ? { is_default: false } : {}),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (shouldSetDefault) {
        const { data: defaultSeries, error: defaultError } = await supabase
          .rpc('set_default_invoice_series', { p_series_id: id })
          .single();
        if (defaultError) throw defaultError;
        return defaultSeries;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-series', centerId] });
      toast.success('Serie actualizada correctamente');
    },
    onError: (error) => {
      toast.error('Error al actualizar la serie: ' + error.message);
    },
  });

  const archiveSeries = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('invoice_series')
        .update({ is_archived: true, is_default: false })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-series', centerId] });
      toast.success('Serie archivada correctamente');
    },
    onError: (error) => {
      toast.error('Error al archivar la serie: ' + error.message);
    },
  });

  const setDefaultSeries = useMutation({
    mutationFn: async (id: string) => {
      if (!centerId) throw new Error('No center ID');

      const { data, error } = await supabase
        .rpc('set_default_invoice_series', { p_series_id: id })
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-series', centerId] });
      toast.success('Serie predeterminada actualizada');
    },
    onError: (error) => {
      toast.error('Error al establecer serie predeterminada: ' + error.message);
    },
  });

  const restoreSeries = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('invoice_series')
        .update({ is_archived: false })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-series', centerId] });
      toast.success('Serie restaurada correctamente');
    },
    onError: (error) => {
      toast.error('Error al restaurar la serie: ' + error.message);
    },
  });

  const ordinarySeries = series.filter(s => s.series_type === 'ordinary');
  const rectifyingSeries = series.filter(s => s.series_type === 'rectifying');

  return {
    series,
    ordinarySeries,
    rectifyingSeries,
    isLoading,
    createSeries,
    updateSeries,
    archiveSeries,
    setDefaultSeries,
    restoreSeries,
  };
}
