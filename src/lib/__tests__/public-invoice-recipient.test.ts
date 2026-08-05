import { describe, expect, it } from 'vitest';
import { resolvePublicInvoiceRecipient } from '@/lib/publicInvoiceRecipient';

describe('resolvePublicInvoiceRecipient', () => {
  it('prefers the immutable invoice snapshot over current patient data', () => {
    expect(resolvePublicInvoiceRecipient(
      {
        name: 'Cliente al emitir',
        tax_id: '12345678Z',
        address: 'Calle Antigua 1',
      },
      {
        first_name: 'Cliente',
        last_name: 'Actual',
        tax_id: '87654321X',
        address: 'Calle Nueva 2',
        phone: '600000000',
      },
    )).toEqual({
      name: 'Cliente al emitir',
      tax_id: '12345678Z',
      address: 'Calle Antigua 1',
      city: null,
      postal_code: null,
      email: null,
      phone: '600000000',
    });
  });

  it('uses the token-authorized patient data for legacy invoices without a snapshot', () => {
    expect(resolvePublicInvoiceRecipient(null, {
      first_name: 'Ana',
      last_name: 'García',
      email: 'ana@example.com',
    })).toMatchObject({
      name: 'Ana García',
      email: 'ana@example.com',
    });
  });

  it('returns a safe empty recipient for malformed data', () => {
    expect(resolvePublicInvoiceRecipient('invalid', [])).toEqual({
      name: '',
      tax_id: null,
      address: null,
      city: null,
      postal_code: null,
      email: null,
      phone: null,
    });
  });
});
