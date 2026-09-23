import { describe, expect, it } from 'vitest';
import { defaultPayerFor, resolveCoupleRoles } from '../couple-session';

describe('resolveCoupleRoles', () => {
  it('sesión individual: titular es el contacto y no hay participante', () => {
    expect(resolveCoupleRoles({ patientId: 'a', partnerId: 'b', payer: 'partner', isCoupleType: false }))
      .toEqual({ titularId: 'a', participantId: null });
  });

  it('pareja pagando el contacto elegido', () => {
    expect(resolveCoupleRoles({ patientId: 'a', partnerId: 'b', payer: 'patient', isCoupleType: true }))
      .toEqual({ titularId: 'a', participantId: 'b' });
  });

  it('pareja pagando la pareja: se intercambian los papeles', () => {
    expect(resolveCoupleRoles({ patientId: 'a', partnerId: 'b', payer: 'partner', isCoupleType: true }))
      .toEqual({ titularId: 'b', participantId: 'a' });
  });

  it('tipo de pareja sin segundo miembro se trata como individual', () => {
    expect(resolveCoupleRoles({ patientId: 'a', partnerId: '', payer: 'partner', isCoupleType: true }))
      .toEqual({ titularId: 'a', participantId: null });
  });

  it('ignora una pareja igual al propio contacto', () => {
    expect(resolveCoupleRoles({ patientId: 'a', partnerId: 'a', payer: 'partner', isCoupleType: true }))
      .toEqual({ titularId: 'a', participantId: null });
  });
});

describe('defaultPayerFor', () => {
  it('sin pagador definido paga el contacto elegido', () => {
    expect(defaultPayerFor('a', null)).toBe('patient');
  });
  it('el pagador por defecto es la pareja', () => {
    expect(defaultPayerFor('a', 'b')).toBe('partner');
  });
  it('el pagador por defecto es el propio contacto', () => {
    expect(defaultPayerFor('a', 'a')).toBe('patient');
  });
});
