export type InvoiceDocumentType = 'simplified' | 'complete';
export type InvoiceSeriesType = 'ordinary' | 'rectifying';

export interface SelectableInvoiceSeries {
  id: string;
  name: string;
  invoice_type: InvoiceDocumentType;
  series_type: InvoiceSeriesType;
  is_default: boolean | null;
  is_archived: boolean | null;
}

export function getCompatibleInvoiceSeries<T extends SelectableInvoiceSeries>(
  series: readonly T[],
  invoiceType: InvoiceDocumentType,
  seriesType: InvoiceSeriesType = 'ordinary',
): T[] {
  return series.filter((candidate) =>
    candidate.invoice_type === invoiceType
    && candidate.series_type === seriesType
    && !candidate.is_archived
  );
}

/**
 * Automatic flows may use a default series or the only compatible series.
 * When several candidates exist without a default, choosing by array order
 * would make fiscal numbering depend on a display sort, so configuration is
 * required instead.
 */
export function selectAutomaticInvoiceSeries<T extends SelectableInvoiceSeries>(
  series: readonly T[],
  invoiceType: InvoiceDocumentType,
  seriesType: InvoiceSeriesType = 'ordinary',
): T {
  const compatible = getCompatibleInvoiceSeries(series, invoiceType, seriesType);
  const defaultSeries = compatible.find((candidate) => candidate.is_default);

  if (defaultSeries) return defaultSeries;
  if (compatible.length === 1) return compatible[0];

  const invoiceLabel = invoiceType === 'simplified' ? 'simplificada' : 'completa';
  const seriesLabel = seriesType === 'ordinary' ? 'ordinaria' : 'rectificativa';

  if (compatible.length === 0) {
    throw new Error(
      `No hay una serie ${seriesLabel} ${invoiceLabel} activa. Configúrala en Ajustes > Facturación > Series de facturas.`,
    );
  }

  throw new Error(
    `Hay varias series ${seriesLabel}s ${invoiceLabel}s y ninguna es predeterminada. Selecciona una como predeterminada en Ajustes > Facturación > Series de facturas.`,
  );
}

export function assertInvoiceSeriesMatches(
  series: SelectableInvoiceSeries,
  invoiceType: InvoiceDocumentType,
  seriesType: InvoiceSeriesType = 'ordinary',
): void {
  if (series.is_archived) {
    throw new Error('La serie de facturación seleccionada está archivada. Selecciona una serie activa.');
  }
  if (series.invoice_type !== invoiceType || series.series_type !== seriesType) {
    throw new Error(
      'La serie seleccionada no corresponde al tipo de factura solicitado. Vuelve a seleccionar el tipo y la serie.',
    );
  }
}
