import { describe, expect, it } from 'vitest';
import {
  buildVerifactuCancellationInvoiceIdXml,
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
});
