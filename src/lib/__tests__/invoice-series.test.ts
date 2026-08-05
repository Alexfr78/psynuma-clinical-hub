import { describe, expect, it } from 'vitest';
import {
  assertInvoiceSeriesMatches,
  getCompatibleInvoiceSeries,
  selectAutomaticInvoiceSeries,
} from '@/lib/invoice-series';

const series = [
  { id: 'complete', name: 'FC', invoice_type: 'complete' as const, series_type: 'ordinary' as const, is_default: true, is_archived: false },
  { id: 'simple', name: 'FS', invoice_type: 'simplified' as const, series_type: 'ordinary' as const, is_default: true, is_archived: false },
  { id: 'archived', name: 'OLD', invoice_type: 'simplified' as const, series_type: 'ordinary' as const, is_default: false, is_archived: true },
];

describe('invoice series selection', () => {
  it('keeps complete and simplified defaults independent', () => {
    expect(selectAutomaticInvoiceSeries(series, 'complete').id).toBe('complete');
    expect(selectAutomaticInvoiceSeries(series, 'simplified').id).toBe('simple');
  });

  it('filters archived and incompatible series', () => {
    expect(getCompatibleInvoiceSeries(series, 'simplified').map((item) => item.id)).toEqual(['simple']);
  });

  it('does not silently choose among multiple non-default series', () => {
    const ambiguous = [
      { ...series[1], id: 'simple-a', is_default: false },
      { ...series[1], id: 'simple-b', is_default: false },
    ];
    expect(() => selectAutomaticInvoiceSeries(ambiguous, 'simplified')).toThrow('ninguna es predeterminada');
  });

  it('rejects a series whose document type does not match', () => {
    expect(() => assertInvoiceSeriesMatches(series[0], 'simplified')).toThrow('no corresponde');
  });
});
