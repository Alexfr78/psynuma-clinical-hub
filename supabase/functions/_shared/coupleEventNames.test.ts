import { describe, expect, it } from 'vitest';
import { coupleDisplayNames, partnersFromEmbed, withPartnerNames } from './coupleEventNames';

const ana = { first_name: 'Ana', last_name: 'López' };
const luis = { first_name: 'Luis', last_name: 'Pérez' };

describe('couple event names', () => {
  it('reads partners from the session_participants embed', () => {
    expect(partnersFromEmbed([{ patient: luis }, { patient: [ana] }, { patient: null }])).toEqual([luis, ana]);
    expect(partnersFromEmbed(null)).toEqual([]);
  });

  it('names both members for {paciente} and {nombre}', () => {
    expect(coupleDisplayNames(ana, [luis])).toEqual({ full: 'Ana López y Luis Pérez', first: 'Ana y Luis' });
  });

  it('leaves individual sessions alone', () => {
    expect(coupleDisplayNames(ana, [])).toBeNull();
  });

  it('adds the partner to a ready-made title only once', () => {
    expect(withPartnerNames('Ana', [luis])).toBe('Ana y Luis');
    expect(withPartnerNames('Ana y Luis', [luis])).toBe('Ana y Luis');
    expect(withPartnerNames('Ana', [])).toBe('Ana');
  });
});
