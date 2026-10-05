import { describe, expect, it } from 'vitest';
import { pickSessionToConfirm, summarizeConfirmations } from './memberConfirmation';

describe('summarizeConfirmations', () => {
  it('confirms an individual session with its only member', () => {
    expect(summarizeConfirmations(['ana'], ['ana'])).toEqual({ confirmedCount: 1, totalMembers: 1, allConfirmed: true });
  });

  it('keeps a couple session partial until both members confirm', () => {
    expect(summarizeConfirmations(['ana', 'luis'], ['ana'])).toEqual({ confirmedCount: 1, totalMembers: 2, allConfirmed: false });
    expect(summarizeConfirmations(['ana', 'luis'], ['luis', 'ana']).allConfirmed).toBe(true);
  });

  it('ignores confirmations from people who left the session', () => {
    expect(summarizeConfirmations(['ana'], ['luis'])).toEqual({ confirmedCount: 0, totalMembers: 1, allConfirmed: false });
  });
});

describe('pickSessionToConfirm', () => {
  const couple = { id: 'couple', session_date: '2026-10-03', start_time: '18:00', memberIds: ['ana', 'luis'], confirmedIds: [] as string[] };
  const lunasOwn = { id: 'own', session_date: '2026-10-03', start_time: '10:00', memberIds: ['luis'], confirmedIds: [] as string[] };

  it('lets the partner (not the payer) confirm the couple session', () => {
    expect(pickSessionToConfirm([couple], ['luis'])).toEqual({ session: couple, patientId: 'luis' });
  });

  it('picks the earliest session the responder has not confirmed yet', () => {
    expect(pickSessionToConfirm([couple, lunasOwn], ['luis'])?.session.id).toBe('own');
    const ownDone = { ...lunasOwn, confirmedIds: ['luis'] };
    expect(pickSessionToConfirm([couple, ownDone], ['luis'])?.session.id).toBe('couple');
  });

  it('never confirms a session the responder is not part of', () => {
    expect(pickSessionToConfirm([couple], ['marta'])).toBeNull();
  });

  it('returns null when the responder already confirmed everything', () => {
    expect(pickSessionToConfirm([{ ...couple, confirmedIds: ['ana'] }], ['ana'])).toBeNull();
  });
});
