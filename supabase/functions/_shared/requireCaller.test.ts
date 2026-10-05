import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canActOnCenter, resolveCaller } from './requireCaller';

const SERVICE_KEY = 'service-key';

function admin({ userId = null as string | null, centerId = null as string | null, claimsRole = null as string | null } = {}) {
  return {
    auth: {
      getClaims: vi.fn(async () =>
        claimsRole ? { data: { claims: { role: claimsRole } }, error: null } : { data: null, error: new Error('no verificable') },
      ),
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

const ENV: Record<string, string> = {
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  SUPABASE_URL: 'https://proj.test',
  SUPABASE_ANON_KEY: 'anon',
};

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeJwt = (payload: object) => `${b64url({ alg: 'ES256' })}.${b64url(payload)}.sig`;

beforeEach(() => {
  vi.stubGlobal('Deno', { env: { get: (k: string) => ENV[k] } });
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

  it('acepta un JWT service_role con firma verificable sin consultar Auth', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveCaller(request(fakeJwt({ role: 'service_role' })), admin({ claimsRole: 'service_role' }))).toEqual({ kind: 'service' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('acepta un JWT service_role del formato nuevo si Auth lo valida', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = admin();
    expect(await resolveCaller(request(fakeJwt({ role: 'service_role' })), client)).toEqual({ kind: 'service' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it('rechaza un JWT que dice ser service_role si Auth no lo valida', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    expect(await resolveCaller(request(fakeJwt({ role: 'service_role' })), admin())).toBeNull();
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
