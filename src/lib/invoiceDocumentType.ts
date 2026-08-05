/**
 * Utility to determine invoice document type label and flags
 * Unified logic for both frontend and backend (edge function)
 */

export interface InvoiceSeries {
  invoice_type: 'simplified' | 'complete' | null;
  series_type: 'ordinary' | 'rectifying' | null;
  name?: string;
}

export interface InvoiceForLabel {
  invoice_type?: 'simplified' | 'complete' | null;
  is_recapitulative?: boolean | null;
  rectified_invoice_id?: string | null;
  rectification_type?: 'differences' | 'substitution' | string | null;
  verifactu_invoice_type?: string | null;
}

export interface InvoiceDocumentTypeResult {
  /** Full label for display, e.g. "FACTURA RECTIFICATIVA SIMPLIFICADA (Por diferencias)" */
  label: string;
  /** Short label for badges, e.g. "Rectificativa simplificada" */
  shortLabel: string;
  /** Flags for conditional rendering */
  flags: {
    isSimplified: boolean;
    isRectifying: boolean;
    isSubstitution: boolean;
    isRecapitulativa: boolean;
  };
}

/**
 * Determines the invoice document type label based on invoice and series data
 * 
 * Rules:
 * 1. If rectified_invoice_id exists OR series_type == 'rectifying':
 *    - Base: "FACTURA RECTIFICATIVA"
 *    - If rectification_type == 'substitution': add "(Sustitutiva)"
 *    - Otherwise: add "(Por diferencias)"
 *    - If invoice_type == 'simplified': add "SIMPLIFICADA" after "RECTIFICATIVA"
 * 
 * 2. If is_recapitulative == true:
 *    - Base: "FACTURA RECAPITULATIVA"
 *    - If invoice_type == 'simplified': add "SIMPLIFICADA"
 * 
 * 3. Otherwise:
 *    - If invoice_type == 'simplified': "FACTURA SIMPLIFICADA"
 *    - If invoice_type == 'complete': "FACTURA"
 */
export function getInvoiceDocumentType(
  invoice: InvoiceForLabel,
  series: InvoiceSeries | null | undefined
): InvoiceDocumentTypeResult {
  if (invoice.verifactu_invoice_type === 'F3') {
    return {
      label: 'FACTURA COMPLETA EN SUSTITUCIÓN DE FACTURA SIMPLIFICADA',
      shortLabel: 'Factura completa F3',
      flags: {
        isSimplified: false,
        isRectifying: false,
        isSubstitution: true,
        isRecapitulativa: false,
      },
    };
  }

  const isSimplified = (invoice.invoice_type ?? series?.invoice_type) === 'simplified';
  const isRectifying = 
    !!invoice.rectified_invoice_id || 
    series?.series_type === 'rectifying';
  const isSubstitution = invoice.rectification_type === 'substitution';
  const isRecapitulativa = !!invoice.is_recapitulative;

  let label: string;
  let shortLabel: string;

  if (isRectifying) {
    // Rectifying invoice
    const rectTypeLabel = isSubstitution ? '(Sustitutiva)' : '(Por diferencias)';
    
    if (isSimplified) {
      label = `FACTURA RECTIFICATIVA SIMPLIFICADA ${rectTypeLabel}`;
      shortLabel = `Rectificativa simplificada ${rectTypeLabel.toLowerCase()}`;
    } else {
      label = `FACTURA RECTIFICATIVA ${rectTypeLabel}`;
      shortLabel = `Rectificativa ${rectTypeLabel.toLowerCase()}`;
    }
  } else if (isRecapitulativa) {
    // Recapitulative invoice
    if (isSimplified) {
      label = 'FACTURA RECAPITULATIVA SIMPLIFICADA';
      shortLabel = 'Recapitulativa simplificada';
    } else {
      label = 'FACTURA RECAPITULATIVA';
      shortLabel = 'Recapitulativa';
    }
  } else {
    // Regular invoice
    if (isSimplified) {
      label = 'FACTURA SIMPLIFICADA';
      shortLabel = 'Simplificada';
    } else {
      label = 'FACTURA';
      shortLabel = 'Completa';
    }
  }

  return {
    label,
    shortLabel,
    flags: {
      isSimplified,
      isRectifying,
      isSubstitution,
      isRecapitulativa,
    },
  };
}
