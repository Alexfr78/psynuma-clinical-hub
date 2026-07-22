import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type InvoiceTypeCorrectionOperation = 'rectificativa_substitution' | 'f3_replacement';

export interface CorrectionSeriesOption {
  id: string;
  name: string;
  series_type: 'ordinary' | 'rectifying';
  invoice_type: 'simplified' | 'complete';
  is_default: boolean | null;
  next_number: number;
}

export interface CorrectionRecipient {
  name: string;
  tax_id: string;
  address: string;
  city: string;
  postal_code: string;
  email?: string;
}

export interface InvoiceTypeCorrectionContext {
  eligible: boolean;
  blocker: string | null;
  source_invoice_type: 'simplified' | 'complete';
  can_create_f3: boolean;
  existing_operation: {
    id: string;
    operation_type: InvoiceTypeCorrectionOperation;
    status: string;
    resulting_invoice_id: string | null;
  } | null;
  recipient: Partial<CorrectionRecipient>;
  series: CorrectionSeriesOption[];
}

export interface FixInvoiceTypeInput {
  originalInvoiceId: string;
  operationType: InvoiceTypeCorrectionOperation;
  seriesId: string;
  recipient: CorrectionRecipient;
  updatePatient: boolean;
  idempotencyKey: string;
}

export interface FixInvoiceTypeResult {
  success: boolean;
  status: 'registered' | 'already_completed' | 'pending_aeat' | 'rejected' | 'manual_review';
  operation_id: string;
  invoice_id: string;
  invoice_number: string;
  verifactu_invoice_type?: string;
  csv?: string | null;
  error?: string;
  message?: string;
}

export function useInvoiceTypeCorrectionContext(invoiceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['invoice-type-correction-context', invoiceId],
    enabled: enabled && !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_invoice_type_correction_context', {
        p_original_invoice_id: invoiceId!,
      });
      if (error) throw error;
      return data as unknown as InvoiceTypeCorrectionContext;
    },
    staleTime: 0,
  });
}

export function useFixInvoiceType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: FixInvoiceTypeInput) => {
      const { data, error } = await supabase.functions.invoke<FixInvoiceTypeResult>('fix-invoice-type', {
        body: {
          original_invoice_id: input.originalInvoiceId,
          operation_type: input.operationType,
          series_id: input.seriesId,
          recipient: input.recipient,
          update_patient: input.updatePatient,
          idempotency_key: input.idempotencyKey,
        },
      });

      if (error) throw error;
      if (!data) throw new Error('La operación no devolvió una respuesta');
      return data;
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['invoice', variables.originalInvoiceId] }),
        queryClient.invalidateQueries({ queryKey: ['invoice-type-correction-context', variables.originalInvoiceId] }),
        queryClient.invalidateQueries({ queryKey: ['invoice-series'] }),
        queryClient.invalidateQueries({ queryKey: ['debts'] }),
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
      ]);
    },
  });
}
