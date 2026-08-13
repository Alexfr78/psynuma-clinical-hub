import { describe, expect, it } from 'vitest';
import {
  buildVerifactuCancellationHashInput,
  buildVerifactuCancellationInvoiceIdXml,
  formatVerifactuTimestamp,
  sanitizeVerifactuSystemName,
} from '../../../supabase/functions/_shared/verifactuCancellation';

describe('Verifactu cancellation XML', () => {
  it('uses the cancellation-specific AEAT invoice identifier fields', () => {
    const xml = buildVerifactuCancellationInvoiceIdXml({
      issuerTaxId: '12345678Z',
      invoiceNumber: 'SP260052',
      issueDate: '13-08-2026',
    });

    expect(xml).toContain('<sum1:IDEmisorFacturaAnulada>12345678Z</sum1:IDEmisorFacturaAnulada>');
    expect(xml).toContain('<sum1:NumSerieFacturaAnulada>SP260052</sum1:NumSerieFacturaAnulada>');
    expect(xml).toContain('<sum1:FechaExpedicionFacturaAnulada>13-08-2026</sum1:FechaExpedicionFacturaAnulada>');
    expect(xml).not.toContain('<sum1:IDEmisorFactura>');
    expect(xml).not.toContain('<sum1:NumSerieFactura>');
    expect(xml).not.toContain('<sum1:FechaExpedicionFactura>');
  });

  it('uses a valid AEAT software system name instead of the legal manufacturer name', () => {
    expect(sanitizeVerifactuSystemName('PSYCMA')).toBe('PSYCMA');
    expect(sanitizeVerifactuSystemName('  Psycma\nClínica  ')).toBe('Psycma Clínica');
    expect(sanitizeVerifactuSystemName('JOSE ALEJANDRO FERNANDEZ RODRIGUEZ')).toBe(
      'JOSE ALEJANDRO FERNANDEZ RODRI',
    );
    expect(sanitizeVerifactuSystemName('')).toBe('PSYCMA');
  });

  it('formats the generation timestamp as AEAT ISO 8601 with a timezone offset', () => {
    const timestamp = formatVerifactuTimestamp(new Date(2026, 7, 13, 14, 5, 9));

    expect(timestamp).toMatch(/^2026-08-13T14:05:09[+-]\d{2}:\d{2}$/);
    expect(timestamp).not.toMatch(/^13-08-2026/);
  });

  it('builds the cancellation hash input with the exact AEAT field names and order', async () => {
    const input = buildVerifactuCancellationHashInput({
      issuerTaxId: '89890001K',
      invoiceNumber: '12345679/G34',
      issueDate: '01-01-2024',
      previousHash: 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
      generationTimestamp: '2024-01-01T19:20:40+01:00',
    });

    expect(input).toBe(
      'IDEmisorFacturaAnulada=89890001K'
      + '&NumSerieFacturaAnulada=12345679/G34'
      + '&FechaExpedicionFacturaAnulada=01-01-2024'
      + '&Huella=F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97'
      + '&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00',
    );

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    expect(hash).toBe('177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68');
  });
});
