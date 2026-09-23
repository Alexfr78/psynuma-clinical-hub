import { describe, expect, it } from 'vitest';

import {
  fillIdentityPlaceholders,
  getPendingIdentityFields,
  resolveIdentityPlaceholders,
  validateIdentityDocument,
} from '@/lib/consent-identity';

const adult = {
  tax_id: null,
  guardian_tax_id: null,
  guardian_name: null,
  guardian_relationship: null,
  is_minor: false,
};

const minor = {
  ...adult,
  is_minor: true,
  guardian_name: 'Ana López',
  guardian_relationship: 'mother',
};

describe('validateIdentityDocument', () => {
  it('acepta DNI y NIE con la letra correcta, con o sin separadores', () => {
    expect(validateIdentityDocument('12345678Z').valid).toBe(true);
    expect(validateIdentityDocument('12.345.678-z').valid).toBe(true);
    expect(validateIdentityDocument('X1234567L').valid).toBe(true);
  });

  it('rechaza letra incorrecta, formato raro y vacío', () => {
    expect(validateIdentityDocument('12345678A')).toEqual({
      valid: false,
      message: 'La letra no es correcta. Debería ser «Z»',
    });
    expect(validateIdentityDocument('B12345678').valid).toBe(false);
    expect(validateIdentityDocument('  ').valid).toBe(false);
  });
});

describe('resolveIdentityPlaceholders', () => {
  const template = '<p>Yo, X, con DNI <strong>{dni_paciente}</strong>, declaro:</p>';

  it('rellena el DNI del paciente si está en la ficha', () => {
    const result = resolveIdentityPlaceholders(template, { ...adult, tax_id: '12345678Z' });
    expect(result).toContain('12345678Z');
    expect(getPendingIdentityFields(result)).toEqual([]);
  });

  it('deja pendiente el DNI de un adulto sin DNI en la ficha', () => {
    const result = resolveIdentityPlaceholders(template, adult);
    expect(getPendingIdentityFields(result)).toEqual(['patient']);
  });

  it('en menores no pide su DNI y añade el del tutor', () => {
    const result = resolveIdentityPlaceholders(template, minor);
    expect(result).toContain('con DNI <strong>—</strong>');
    expect(result).toContain('Representante legal: <strong>Ana López</strong> (madre)');
    expect(getPendingIdentityFields(result)).toEqual(['guardian']);
  });

  it('en menores con DNI del tutor en la ficha no queda nada pendiente', () => {
    const result = resolveIdentityPlaceholders(template, { ...minor, guardian_tax_id: 'X1234567L' });
    expect(result).toContain('X1234567L');
    expect(getPendingIdentityFields(result)).toEqual([]);
  });

  it('usa {dni_tutor} de la plantilla sin añadir párrafo', () => {
    const withGuardian = `${template}<p>Tutor con DNI {dni_tutor}</p>`;
    const result = resolveIdentityPlaceholders(withGuardian, minor);
    expect(result).not.toContain('Representante legal');
    expect(getPendingIdentityFields(result)).toEqual(['guardian']);
  });

  it('vacía {dni_tutor} si el paciente no es menor', () => {
    const result = resolveIdentityPlaceholders('<p>{dni_tutor}</p>', { ...adult, tax_id: '12345678Z' });
    expect(result).toBe('<p></p>');
  });

  it('no toca plantillas sin DNI', () => {
    expect(resolveIdentityPlaceholders('<p>Hola</p>', minor)).toBe('<p>Hola</p>');
  });

  it('escapa el nombre del tutor', () => {
    const result = resolveIdentityPlaceholders(template, { ...minor, guardian_name: '<b>x</b>' });
    expect(result).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('fillIdentityPlaceholders', () => {
  it('sustituye todas las apariciones', () => {
    const result = fillIdentityPlaceholders('{dni_paciente} y {dni_paciente}; {dni_tutor}', {
      patient: '12345678Z',
    });
    expect(result).toBe('12345678Z y 12345678Z; {dni_tutor}');
  });
});
