/**
 * Diseño del documento de factura de un centro (pantalla Personalizar facturas).
 *
 * El borrador se compone de los campos de `centers` que se pueden probar en la
 * vista previa sin guardar; generate-invoice-pdf ({ preview: true, overrides })
 * acepta exactamente estas claves. Logo y firma se suben al momento y no forman
 * parte del borrador.
 */

export type InvoiceTemplate = 'standard' | 'formal';

export interface InvoiceDesignDraft {
  invoice_template: InvoiceTemplate;
  invoice_primary_color: string | null;
  invoice_secondary_color: string | null;
  invoice_license_line: string | null;
  invoice_tax_exemption_note: string | null;
  invoice_footer: string | null;
  invoice_data_protection_text: string | null;
  /** Compartido con los recordatorios de pago (Métodos de cobro). */
  bank_transfer_info: string | null;
}

export const INVOICE_DESIGN_FIELDS = [
  'invoice_template',
  'invoice_primary_color',
  'invoice_secondary_color',
  'invoice_license_line',
  'invoice_tax_exemption_note',
  'invoice_footer',
  'invoice_data_protection_text',
  'bank_transfer_info',
] as const satisfies readonly (keyof InvoiceDesignDraft)[];

export const INVOICE_TEXT_LIMITS = {
  invoice_license_line: 120,
  invoice_tax_exemption_note: 300,
  invoice_footer: 2000,
  invoice_data_protection_text: 2000,
  // Mismo campo que Métodos de cobro (sin límite allí): holgado para no recortar.
  bank_transfer_info: 2000,
} as const;

export interface InvoiceTemplateOption {
  value: InvoiceTemplate;
  label: string;
  description: string;
  /** Colores que usa el PDF cuando el centro no ha elegido ninguno. */
  defaultColors: { primary: string; secondary: string };
  /** Qué pinta cada color en este modelo. */
  colorRoles: { primary: string; secondary: string };
  /** Campos que este modelo imprime (el resto se oculta en el formulario). */
  fields: readonly (keyof InvoiceDesignDraft)[];
}

export const INVOICE_TEMPLATE_OPTIONS: readonly InvoiceTemplateOption[] = [
  {
    value: 'standard',
    label: 'Estándar',
    description: 'Logo y datos del centro arriba, IVA e IRPF por línea y QR al pie.',
    defaultColors: { primary: '#2563eb', secondary: '#64748b' },
    colorRoles: { primary: 'Nombre del centro, número, línea y total', secondary: 'Datos del centro, fechas y etiquetas' },
    fields: ['invoice_footer', 'invoice_data_protection_text'],
  },
  {
    value: 'formal',
    label: 'Formal',
    description: 'Profesional colegiado: tabla con bordes, IVA desglosado, firma y forma de pago.',
    defaultColors: { primary: '#9fc9eb', secondary: '#b0c0c9' },
    colorRoles: { primary: 'Banda del título', secondary: 'Barras de cabecera y pie' },
    fields: [
      'invoice_license_line',
      'invoice_tax_exemption_note',
      'bank_transfer_info',
      'invoice_footer',
      'invoice_data_protection_text',
    ],
  },
];

export function getTemplateOption(template: InvoiceTemplate): InvoiceTemplateOption {
  return INVOICE_TEMPLATE_OPTIONS.find((o) => o.value === template) ?? INVOICE_TEMPLATE_OPTIONS[0];
}

const HEX = /^#[0-9a-f]{6}$/;

/** "#ABC123" / "abc123" -> "#abc123"; cualquier otra cosa -> null. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  const withHash = v.startsWith('#') ? v : `#${v}`;
  return HEX.test(withHash) ? withHash : null;
}

function normalizeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

type CenterLike = Partial<Record<keyof InvoiceDesignDraft, unknown>> | null | undefined;

/** Borrador a partir de lo guardado en el centro. */
export function designFromCenter(center: CenterLike): InvoiceDesignDraft {
  return normalizeDesign({
    invoice_template: center?.invoice_template as InvoiceTemplate,
    invoice_primary_color: center?.invoice_primary_color as string | null,
    invoice_secondary_color: center?.invoice_secondary_color as string | null,
    invoice_license_line: center?.invoice_license_line as string | null,
    invoice_tax_exemption_note: center?.invoice_tax_exemption_note as string | null,
    invoice_footer: center?.invoice_footer as string | null,
    invoice_data_protection_text: center?.invoice_data_protection_text as string | null,
    bank_transfer_info: center?.bank_transfer_info as string | null,
  });
}

/** Deja el borrador como se guardaría: textos recortados, vacíos a null, colores en minúscula. */
export function normalizeDesign(draft: InvoiceDesignDraft): InvoiceDesignDraft {
  return {
    invoice_template: draft.invoice_template === 'formal' ? 'formal' : 'standard',
    invoice_primary_color: normalizeHexColor(draft.invoice_primary_color),
    invoice_secondary_color: normalizeHexColor(draft.invoice_secondary_color),
    invoice_license_line: normalizeText(draft.invoice_license_line, INVOICE_TEXT_LIMITS.invoice_license_line),
    invoice_tax_exemption_note: normalizeText(draft.invoice_tax_exemption_note, INVOICE_TEXT_LIMITS.invoice_tax_exemption_note),
    invoice_footer: normalizeText(draft.invoice_footer, INVOICE_TEXT_LIMITS.invoice_footer),
    invoice_data_protection_text: normalizeText(draft.invoice_data_protection_text, INVOICE_TEXT_LIMITS.invoice_data_protection_text),
    bank_transfer_info: normalizeText(draft.bank_transfer_info, INVOICE_TEXT_LIMITS.bank_transfer_info),
  };
}

/** Campos del borrador que difieren de lo guardado (lo que hay que mandar a updateCenter). */
export function diffDesign(saved: InvoiceDesignDraft, draft: InvoiceDesignDraft): Partial<InvoiceDesignDraft> {
  const a = normalizeDesign(saved);
  const b = normalizeDesign(draft);
  const changes: Partial<InvoiceDesignDraft> = {};
  for (const key of INVOICE_DESIGN_FIELDS) {
    if (a[key] !== b[key]) (changes as Record<string, unknown>)[key] = b[key];
  }
  return changes;
}

export function isDesignDirty(saved: InvoiceDesignDraft, draft: InvoiceDesignDraft): boolean {
  return Object.keys(diffDesign(saved, draft)).length > 0;
}

/** Color efectivo (el elegido o el del modelo), para pintar el selector. */
export function effectiveColor(draft: InvoiceDesignDraft, role: 'primary' | 'secondary'): string {
  const chosen = role === 'primary' ? draft.invoice_primary_color : draft.invoice_secondary_color;
  return normalizeHexColor(chosen) ?? getTemplateOption(draft.invoice_template).defaultColors[role];
}
