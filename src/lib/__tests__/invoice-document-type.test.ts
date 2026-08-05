import { describe, expect, it } from 'vitest';
import { getInvoiceDocumentType } from '@/lib/invoiceDocumentType';

describe('getInvoiceDocumentType', () => {
  it('prefers the immutable invoice snapshot over a changed series classification', () => {
    const result = getInvoiceDocumentType(
      { invoice_type: 'simplified' },
      { invoice_type: 'complete', series_type: 'ordinary' },
    );

    expect(result.label).toBe('FACTURA SIMPLIFICADA');
    expect(result.flags.isSimplified).toBe(true);
  });

  it('labels an explicit F3 independently from the ordinary complete series', () => {
    const result = getInvoiceDocumentType(
      { verifactu_invoice_type: 'F3' },
      { invoice_type: 'complete', series_type: 'ordinary' },
    );

    expect(result.label).toContain('SUSTITUCIÓN DE FACTURA SIMPLIFICADA');
    expect(result.shortLabel).toBe('Factura completa F3');
    expect(result.flags.isRectifying).toBe(false);
    expect(result.flags.isSubstitution).toBe(true);
  });

  it('keeps a substitution rectificativa distinct from F3', () => {
    const result = getInvoiceDocumentType(
      { rectified_invoice_id: 'original', rectification_type: 'substitution', verifactu_invoice_type: 'R5' },
      { invoice_type: 'simplified', series_type: 'rectifying' },
    );

    expect(result.shortLabel).toContain('Rectificativa simplificada');
    expect(result.flags.isRectifying).toBe(true);
  });

  it('preserves legacy inference when no explicit AEAT type exists', () => {
    const result = getInvoiceDocumentType(
      {},
      { invoice_type: 'simplified', series_type: 'ordinary' },
    );

    expect(result.label).toBe('FACTURA SIMPLIFICADA');
  });
});
