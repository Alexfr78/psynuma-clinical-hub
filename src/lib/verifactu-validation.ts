// Pre-AEAT Validation for Session Types and Invoice Items
// Prevents errors like 1181 (CalificacionOperacion) or 4102 (missing fields)

export type TaxTreatment = "S1" | "S2" | "EXENTA" | "NO_SUJETA";
export type ExemptionCode = "E1" | "E2" | "E3" | "E4" | "E5" | "E6";
export type NonSubjectCode = "N1" | "N2";

export interface FiscalProduct {
  id?: string;
  name: string;
  tax_treatment: TaxTreatment;
  vat_rate: number;
  exemption_code?: ExemptionCode | null;
  non_subject_code?: NonSubjectCode | null;
  vat_regime_key?: string | null;
  is_active?: boolean | null;
}

export type Severity = "error" | "warning";

export interface ValidationIssue {
  severity: Severity;
  code: string;
  field?: keyof FiscalProduct | "global";
  message: string;
  hint?: string;
}

const VALID_EXEMPTION: ExemptionCode[] = ["E1", "E2", "E3", "E4", "E5", "E6"];
const VALID_NON_SUBJECT: NonSubjectCode[] = ["N1", "N2"];

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function normalizeKey(s: unknown): string {
  return String(s ?? "").trim();
}

export function validateProductForAEAT(p: FiscalProduct): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Basic checks
  if (!normalizeKey(p.name)) {
    issues.push({
      severity: "error",
      code: "PRODUCT_NAME_EMPTY",
      field: "name",
      message: "El nombre del tipo de sesión está vacío.",
      hint: "Pon un nombre descriptivo (ej: 'Sesión individual' o 'Taller grupal')."
    });
  }

  // VAT regime: default "01"
  const regime = normalizeKey(p.vat_regime_key) || "01";
  if (!regime) {
    issues.push({
      severity: "error",
      code: "VAT_REGIME_MISSING",
      field: "vat_regime_key",
      message: "Falta la clave de régimen (ClaveRegimen).",
      hint: "Usa '01' como valor por defecto si no gestionas regímenes especiales."
    });
  }

  // vat_rate must exist and be a number
  if (!isFiniteNumber(p.vat_rate)) {
    issues.push({
      severity: "error",
      code: "VAT_RATE_NOT_NUMBER",
      field: "vat_rate",
      message: "El tipo de IVA no es un número válido.",
      hint: "Usa 21, 10, 4 o 0 (y evita null/undefined)."
    });
  }

  const vatRate = isFiniteNumber(p.vat_rate) ? p.vat_rate : NaN;
  const exemption = p.exemption_code ?? null;
  const nonSubject = p.non_subject_code ?? null;

  // Rules by fiscal treatment
  switch (p.tax_treatment) {
    case "S1": {
      // Subject with normal VAT (workshops 21%)
      if (!(vatRate > 0)) {
        issues.push({
          severity: "error",
          code: "S1_REQUIRES_POSITIVE_VAT",
          field: "vat_rate",
          message: "Tratamiento S1 requiere un tipo de IVA mayor que 0.",
          hint: "Para talleres usa 21 (o el tipo que corresponda)."
        });
      }
      if (exemption) {
        issues.push({
          severity: "error",
          code: "S1_CANNOT_HAVE_EXEMPTION_CODE",
          field: "exemption_code",
          message: "En S1 no debe informarse un código de exención (E1–E6).",
          hint: "Elimina el código E* o cambia el tratamiento a EXENTA."
        });
      }
      if (nonSubject) {
        issues.push({
          severity: "error",
          code: "S1_CANNOT_HAVE_NON_SUBJECT_CODE",
          field: "non_subject_code",
          message: "En S1 no debe informarse un código de no sujeción (N1–N2).",
          hint: "Elimina el código N* o cambia el tratamiento a NO_SUJETA."
        });
      }

      // Soft check: common rates
      if (vatRate !== 21 && vatRate !== 10 && vatRate !== 4) {
        issues.push({
          severity: "warning",
          code: "S1_UNUSUAL_VAT_RATE",
          field: "vat_rate",
          message: `Tipo de IVA poco habitual (${vatRate}).`,
          hint: "Comprueba si debería ser 21, 10 o 4."
        });
      }
      break;
    }

    case "EXENTA": {
      // Exempt: VAT 0 and E*
      if (vatRate !== 0) {
        issues.push({
          severity: "error",
          code: "EXEMPT_REQUIRES_VAT_ZERO",
          field: "vat_rate",
          message: "En EXENTA el tipo de IVA debe ser 0.",
          hint: "Pon vat_rate = 0."
        });
      }
      if (!exemption || !VALID_EXEMPTION.includes(exemption)) {
        issues.push({
          severity: "error",
          code: "EXEMPT_REQUIRES_EXEMPTION_CODE",
          field: "exemption_code",
          message: "En EXENTA debes indicar el código de exención (E1–E6).",
          hint: "Para psicología sanitaria suele ser E1."
        });
      }
      if (nonSubject) {
        issues.push({
          severity: "error",
          code: "EXEMPT_CANNOT_HAVE_NON_SUBJECT_CODE",
          field: "non_subject_code",
          message: "En EXENTA no debe informarse un código de no sujeción (N1–N2).",
          hint: "Elimina N* o cambia el tratamiento a NO_SUJETA."
        });
      }
      break;
    }

    case "NO_SUJETA": {
      // Non-subject: VAT 0 and N*
      if (vatRate !== 0) {
        issues.push({
          severity: "error",
          code: "NON_SUBJECT_REQUIRES_VAT_ZERO",
          field: "vat_rate",
          message: "En NO_SUJETA el tipo de IVA debe ser 0.",
          hint: "Pon vat_rate = 0."
        });
      }
      if (!nonSubject || !VALID_NON_SUBJECT.includes(nonSubject)) {
        issues.push({
          severity: "error",
          code: "NON_SUBJECT_REQUIRES_CODE",
          field: "non_subject_code",
          message: "En NO_SUJETA debes indicar N1 o N2.",
          hint: "Usa N2 si la no sujeción es por reglas de localización."
        });
      }
      if (exemption) {
        issues.push({
          severity: "error",
          code: "NON_SUBJECT_CANNOT_HAVE_EXEMPTION_CODE",
          field: "exemption_code",
          message: "En NO_SUJETA no debe informarse un código de exención (E1–E6).",
          hint: "Elimina E* o cambia el tratamiento a EXENTA."
        });
      }
      break;
    }

    case "S2": {
      // Reverse charge
      if (vatRate !== 0) {
        issues.push({
          severity: "error",
          code: "S2_REQUIRES_VAT_ZERO",
          field: "vat_rate",
          message: "En S2 (inversión) el tipo de IVA debe ser 0.",
          hint: "Pon vat_rate = 0; la cuota repercutida será 0."
        });
      }
      if (exemption) {
        issues.push({
          severity: "error",
          code: "S2_CANNOT_HAVE_EXEMPTION_CODE",
          field: "exemption_code",
          message: "En S2 no debe informarse un código de exención (E1–E6).",
          hint: "Elimina E* o cambia el tratamiento a EXENTA."
        });
      }
      if (nonSubject) {
        issues.push({
          severity: "error",
          code: "S2_CANNOT_HAVE_NON_SUBJECT_CODE",
          field: "non_subject_code",
          message: "En S2 no debe informarse un código N1/N2.",
          hint: "Elimina N* o cambia el tratamiento a NO_SUJETA."
        });
      }
      break;
    }

    default: {
      issues.push({
        severity: "error",
        code: "TAX_TREATMENT_INVALID",
        field: "tax_treatment",
        message: "Tratamiento fiscal desconocido.",
        hint: "Usa S1, EXENTA, NO_SUJETA o S2."
      });
    }
  }

  // Quality checks (non-blocking)
  if (p.is_active === false) {
    issues.push({
      severity: "warning",
      code: "PRODUCT_INACTIVE",
      field: "is_active",
      message: "Este tipo de sesión está inactivo.",
      hint: "No debería usarse en nuevas facturas."
    });
  }

  return issues;
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some(i => i.severity === "error");
}

// Validate invoice line items before AEAT submission
export interface InvoiceLineForValidation {
  description: string;
  taxRate: number;
  tax_treatment?: TaxTreatment;
  exemption_code?: ExemptionCode | null;
  non_subject_code?: NonSubjectCode | null;
}

export function validateInvoiceLinesForAEAT(items: InvoiceLineForValidation[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  items.forEach((item, index) => {
    const linePrefix = items.length > 1 ? `Línea ${index + 1}: ` : "";
    
    // Infer treatment from taxRate if not specified
    const treatment = item.tax_treatment || (item.taxRate === 0 ? "EXENTA" : "S1");
    
    const product: FiscalProduct = {
      name: item.description,
      tax_treatment: treatment,
      vat_rate: item.taxRate,
      exemption_code: item.exemption_code,
      non_subject_code: item.non_subject_code,
    };

    const lineIssues = validateProductForAEAT(product);
    lineIssues.forEach(issue => {
      issues.push({
        ...issue,
        message: `${linePrefix}${issue.message}`,
      });
    });
  });

  return issues;
}

// Tax treatment options for UI
export const TAX_TREATMENT_OPTIONS = [
  { value: "EXENTA", label: "Exenta (art. 20 LIVA)", description: "Servicios sanitarios exentos" },
  { value: "S1", label: "Sujeta con IVA", description: "Talleres, cursos, formación" },
  { value: "S2", label: "Inversión del sujeto pasivo", description: "Operaciones intracomunitarias" },
  { value: "NO_SUJETA", label: "No sujeta", description: "Operaciones no sujetas a IVA" },
] as const;

// Exemption code options for UI
export const EXEMPTION_CODE_OPTIONS = [
  { value: "E1", label: "E1 - Art. 20", description: "Exención por art. 20 LIVA (sanitario)" },
  { value: "E2", label: "E2 - Art. 21", description: "Exención por art. 21 LIVA" },
  { value: "E3", label: "E3 - Art. 22", description: "Exención por art. 22 LIVA" },
  { value: "E4", label: "E4 - Art. 23/24", description: "Exención por art. 23/24 LIVA" },
  { value: "E5", label: "E5 - Art. 25", description: "Exención por art. 25 LIVA" },
  { value: "E6", label: "E6 - Otros", description: "Otras exenciones" },
] as const;

// Non-subject code options for UI
export const NON_SUBJECT_CODE_OPTIONS = [
  { value: "N1", label: "N1 - Art. 7", description: "No sujeta por art. 7 LIVA" },
  { value: "N2", label: "N2 - Localización", description: "No sujeta por reglas de localización" },
] as const;

// VAT rate options for UI
export const VAT_RATE_OPTIONS = [
  { value: 0, label: "0%", description: "Exento o no sujeto" },
  { value: 4, label: "4%", description: "Superreducido" },
  { value: 10, label: "10%", description: "Reducido" },
  { value: 21, label: "21%", description: "General" },
] as const;
