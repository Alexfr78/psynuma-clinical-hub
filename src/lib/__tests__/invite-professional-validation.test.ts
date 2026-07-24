import { describe, expect, it } from 'vitest';
import { validateInviteProfessionalInput } from '../../../supabase/functions/_shared/inviteProfessionalValidation';

describe('professional invitation validation', () => {
  it('normalizes valid invitation data', () => {
    expect(validateInviteProfessionalInput({
      first_name: '  Ana ',
      last_name: ' García  ',
      email: ' ANA@EXAMPLE.COM ',
    })).toEqual({
      data: {
        firstName: 'Ana',
        lastName: 'García',
        email: 'ana@example.com',
      },
    });
  });

  it('rejects incomplete or invalid data', () => {
    expect(validateInviteProfessionalInput({
      first_name: '',
      last_name: 'García',
      email: 'ana@example.com',
    })).toHaveProperty('error');

    expect(validateInviteProfessionalInput({
      first_name: 'Ana',
      last_name: 'García',
      email: 'not-an-email',
    })).toHaveProperty('error');
  });
});
