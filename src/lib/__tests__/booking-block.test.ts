import { describe, expect, it } from 'vitest';
import {
  findSuspectedBlockedPatient,
  normalizeNameForMatch,
  normalizePhoneForMatch,
} from '@/lib/booking-block';

const blocked = [
  { id: 'p1', first_name: 'José', last_name: 'García López', phone: '+34 600 11 22 33' },
  { id: 'p2', first_name: 'Ana', last_name: 'Ruiz', phone: null },
];

describe('normalizePhoneForMatch', () => {
  it('ignora prefijo y espacios', () => {
    expect(normalizePhoneForMatch('+34 600 11 22 33')).toBe('600112233');
    expect(normalizePhoneForMatch('0034600112233')).toBe('600112233');
    expect(normalizePhoneForMatch('600-112-233')).toBe('600112233');
  });
  it('descarta teléfonos demasiado cortos', () => {
    expect(normalizePhoneForMatch('1234')).toBeNull();
    expect(normalizePhoneForMatch(null)).toBeNull();
  });
});

describe('normalizeNameForMatch', () => {
  it('quita tildes, mayúsculas y espacios de más', () => {
    expect(normalizeNameForMatch('  JOSE ', 'garcía   lópez')).toBe('jose garcia lopez');
  });
  it('no compara un nombre suelto', () => {
    expect(normalizeNameForMatch('Ana', '')).toBeNull();
  });
});

describe('findSuspectedBlockedPatient', () => {
  it('detecta coincidencia por teléfono aunque cambie el nombre', () => {
    expect(findSuspectedBlockedPatient({ firstName: 'Pepe', lastName: 'G', phone: '600112233' }, blocked))
      .toEqual({ patientId: 'p1', matchedBy: 'phone' });
  });
  it('detecta coincidencia por nombre completo', () => {
    expect(findSuspectedBlockedPatient({ firstName: 'ana', lastName: 'RUIZ', phone: '611000000' }, blocked))
      .toEqual({ patientId: 'p2', matchedBy: 'name' });
  });
  it('no se compara con el propio paciente identificado por email', () => {
    expect(findSuspectedBlockedPatient({ firstName: 'Ana', lastName: 'Ruiz' }, blocked, 'p2')).toBeNull();
  });
  it('sin coincidencias devuelve null', () => {
    expect(findSuspectedBlockedPatient({ firstName: 'Luis', lastName: 'Pérez', phone: '622000000' }, blocked)).toBeNull();
  });
});
