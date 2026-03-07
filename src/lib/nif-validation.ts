/**
 * Spanish NIF/NIE validation with checksum verification.
 * Returns { valid, message } for form-level feedback.
 */

const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** Validate a Spanish NIF (8 digits + letter) */
function validateNIF(nif: string): boolean {
  const match = nif.match(/^(\d{8})([A-Z])$/);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return NIF_LETTERS[num % 23] === match[2];
}

/** Validate a Spanish NIE (X/Y/Z + 7 digits + letter) */
function validateNIE(nie: string): boolean {
  const match = nie.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (!match) return false;
  const prefix = match[1] === 'X' ? '0' : match[1] === 'Y' ? '1' : '2';
  const num = parseInt(prefix + match[2], 10);
  return NIF_LETTERS[num % 23] === match[3];
}

/** Validate a Spanish CIF (company tax ID) - basic format check */
function validateCIF(cif: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSUVW]\d{7}[A-J0-9]$/.test(cif);
}

export interface NifValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Validates a Spanish tax ID (NIF, NIE, or CIF).
 * Returns { valid: true } if empty (optional field) or valid.
 * Returns { valid: false, message } if format/checksum is wrong.
 */
export function validateSpanishTaxId(taxId: string | null | undefined): NifValidationResult {
  if (!taxId || taxId.trim() === '') {
    return { valid: true }; // Empty is OK (optional field)
  }

  const normalized = taxId.replace(/[\s\-\.]/g, '').toUpperCase();

  if (normalized.length < 8 || normalized.length > 9) {
    return { valid: false, message: 'El NIF/NIE debe tener 8-9 caracteres' };
  }

  // NIF: 8 digits + letter
  if (/^\d{8}[A-Z]$/.test(normalized)) {
    if (!validateNIF(normalized)) {
      const expected = NIF_LETTERS[parseInt(normalized.slice(0, 8), 10) % 23];
      return { 
        valid: false, 
        message: `La letra del NIF no es correcta. Debería ser "${expected}"` 
      };
    }
    return { valid: true };
  }

  // NIE: X/Y/Z + 7 digits + letter
  if (/^[XYZ]\d{7}[A-Z]$/.test(normalized)) {
    if (!validateNIE(normalized)) {
      const prefix = normalized[0] === 'X' ? '0' : normalized[0] === 'Y' ? '1' : '2';
      const expected = NIF_LETTERS[parseInt(prefix + normalized.slice(1, 8), 10) % 23];
      return { 
        valid: false, 
        message: `La letra del NIE no es correcta. Debería ser "${expected}"` 
      };
    }
    return { valid: true };
  }

  // CIF
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[A-J0-9]$/.test(normalized)) {
    if (!validateCIF(normalized)) {
      return { valid: false, message: 'El formato del CIF no es válido' };
    }
    return { valid: true };
  }

  return { valid: false, message: 'Formato de NIF/NIE/CIF no reconocido' };
}
