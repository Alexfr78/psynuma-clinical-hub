export interface PublicInvoiceRecipient {
  name: string;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  email: string | null;
  phone: string | null;
}
type RecipientSource = Record<string, unknown> | null | undefined;

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asRecipientSource(value: unknown): RecipientSource {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function resolvePublicInvoiceRecipient(
  snapshotValue: unknown,
  patientValue: unknown,
): PublicInvoiceRecipient {
  const snapshot = asRecipientSource(snapshotValue);
  const patient = asRecipientSource(patientValue);
  const patientName = [asText(patient?.first_name), asText(patient?.last_name)]
    .filter(Boolean)
    .join(' ');

  return {
    name: asText(snapshot?.name) || asText(patient?.name) || patientName,
    tax_id: asText(snapshot?.tax_id) || asText(patient?.tax_id),
    address: asText(snapshot?.address) || asText(patient?.address),
    city: asText(snapshot?.city) || asText(patient?.city),
    postal_code: asText(snapshot?.postal_code) || asText(patient?.postal_code),
    email: asText(snapshot?.email) || asText(patient?.email),
    phone: asText(snapshot?.phone) || asText(patient?.phone),
  };
}
