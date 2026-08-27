import { validateSpanishTaxId } from '@/lib/nif-validation';

export interface CompleteInvoiceRecipient {
  first_name?: string | null;
  last_name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
}

export const COMPLETE_INVOICE_FIELD_LABELS = {
  name: 'Nombre y apellidos',
  tax_id: 'NIF/CIF válido',
  address: 'Dirección',
  city: 'Ciudad',
  postal_code: 'Código postal',
} as const;

export function getCompleteInvoiceMissingFields(
  recipient: CompleteInvoiceRecipient,
): Array<keyof typeof COMPLETE_INVOICE_FIELD_LABELS> {
  const missing: Array<keyof typeof COMPLETE_INVOICE_FIELD_LABELS> = [];

  if (!`${recipient.first_name || ''} ${recipient.last_name || ''}`.trim()) missing.push('name');
  if (!recipient.tax_id?.trim() || !validateSpanishTaxId(recipient.tax_id).valid) missing.push('tax_id');
  if (!recipient.address?.trim()) missing.push('address');
  if (!recipient.city?.trim()) missing.push('city');
  if (!recipient.postal_code?.trim()) missing.push('postal_code');

  return missing;
}
