import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canActOnCenter, resolveCaller } from './requireCaller';

const SERVICE_KEY = 'service-key';

function admin({ userId = null as string | null, centerId = null as string | null } = {}) {
  return {
    auth: {
      getUser: vi.fn(async () =>
        userId ? { data: { user: { id: userId } }, error: null } : { data: { user: null }, error: new Error('bad jwt') },
      ),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: centerId ? { center_id: centerId } : null }) }) }),
    })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const request = (token?: string) =>
  new Request('https://x.test', { headers: token ? { Authorization: `Bearer ${token}` } : {} });

beforeEach(() => {
  vi.stubGlobal('Deno', { env: { get: (k: string) => (k === 'SUPABASE_SERVICE_ROLE_KEY' ? SERVICE_KEY : undefined) } });
});
afterEach(() => vi.unstubAllGlobals());

describe('resolveCaller', () => {
  it('rechaza peticiones sin token', async () => {
    expect(await resolveCaller(request(), admin())).toBeNull();
  });

  it('reconoce la service role sin consultar auth', async () => {
    const client = admin();
    expect(await resolveCaller(request(SERVICE_KEY), client)).toEqual({ kind: 'service' });
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it('rechaza un JWT inválido (p. ej. la anon key)', async () => {
    expect(await resolveCaller(request('anon'), admin())).toBeNull();
  });

  it('rechaza un usuario sin centro', async () => {
    expect(await resolveCaller(request('jwt'), admin({ userId: 'u1' }))).toBeNull();
  });

  it('devuelve el usuario con su centro', async () => {
    expect(await resolveCaller(request('jwt'), admin({ userId: 'u1', centerId: 'c1' }))).toEqual({
      kind: 'user', userId: 'u1', centerId: 'c1',
    });
  });
});

describe('canActOnCenter', () => {
  const user = { kind: 'user', userId: 'u1', centerId: 'c1' } as const;
  it('la service role puede actuar sobre cualquier centro', () => {
    expect(canActOnCenter({ kind: 'service' }, 'c2')).toBe(true);
  });
  it('un usuario solo sobre el suyo', () => {
    expect(canActOnCenter(user, 'c1')).toBe(true);
    expect(canActOnCenter(user, 'c2')).toBe(false);
    expect(canActOnCenter(user, null)).toBe(false);
  });
});
