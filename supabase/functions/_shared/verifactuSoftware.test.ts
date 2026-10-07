import { describe, expect, it } from 'vitest';
import { resolveVerifactuSoftwareIdentity, VERIFACTU_SOFTWARE_IDENTITY_ERROR } from './verifactuSoftware.ts';

describe('resolveVerifactuSoftwareIdentity', () => {
  it('returns a trimmed provider identity', () => {
    expect(resolveVerifactuSoftwareIdentity({
      verifactu_software_name: ' Psycma SL ',
      verifactu_software_nif: ' B12345678 ',
      verifactu_software_version: ' 2.4.0 ',
      verifactu_sistema_informatico: ' PSYCMA PRO ',
    })).toEqual({
      ok: true,
      identity: { name: 'Psycma SL', nif: 'B12345678', version: '2.4.0', systemName: 'PSYCMA PRO' },
    });
  });

  it('uses PSYCMA only as the system-name fallback', () => {
    expect(resolveVerifactuSoftwareIdentity({
      verifactu_software_name: 'Psycma SL',
      verifactu_software_nif: 'B12345678',
      verifactu_software_version: '2.4.0',
      verifactu_sistema_informatico: ' ',
    })).toMatchObject({ ok: true, identity: { systemName: 'PSYCMA' } });
  });

  for (const field of ['verifactu_software_name', 'verifactu_software_nif', 'verifactu_software_version'] as const) {
    it(`rejects a missing or empty ${field}`, () => {
      const row = {
        verifactu_software_name: 'Psycma SL',
        verifactu_software_nif: 'B12345678',
        verifactu_software_version: '2.4.0',
        [field]: ' ',
      };
      expect(resolveVerifactuSoftwareIdentity(row)).toEqual({ ok: false, error: VERIFACTU_SOFTWARE_IDENTITY_ERROR });
    });
  }

  it('rejects a missing provider row', () => {
    expect(resolveVerifactuSoftwareIdentity(null)).toEqual({ ok: false, error: VERIFACTU_SOFTWARE_IDENTITY_ERROR });
  });
});
