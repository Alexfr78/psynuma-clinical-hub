import { describe, expect, it, vi } from 'vitest';
import {
  acquireVerifactuChainLock,
  blockVerifactuChain,
  commitVerifactuChain,
  releaseVerifactuChainLock,
  type VerifactuChainLockClient,
} from './verifactuChainLock.ts';

describe('verifactuChainLock', () => {
  it('retries until a lock is acquired', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: 'lock-123' });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const lockId = await acquireVerifactuChainLock(
      { rpc } as VerifactuChainLockClient,
      'center-1',
      'B12345678',
      { maxAttempts: 3, retryMs: 1, sleep },
    );

    expect(lockId).toBe('lock-123');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('returns null after all attempts fail', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const lockId = await acquireVerifactuChainLock(
      { rpc } as VerifactuChainLockClient,
      'center-1',
      'B12345678',
      { maxAttempts: 3, retryMs: 1, sleep },
    );

    expect(lockId).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('releases the acquired lock with the expected RPC arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true });

    await releaseVerifactuChainLock(
      { rpc } as VerifactuChainLockClient,
      'center-1',
      'lock-123',
    );

    expect(rpc).toHaveBeenCalledWith('release_verifactu_chain_lock_v2', {
      p_center_id: 'center-1',
      p_lock_id: 'lock-123',
    });
  });
});

describe('blockVerifactuChain', () => {
  const key = { centerId: 'c1', nifEmisor: 'B1', idSistemaInformatico: '01', numeroInstalacion: 1 };

  function client(updatedRows: unknown[]) {
    const updates: Record<string, unknown>[] = [];
    const inserts: Record<string, unknown>[] = [];
    const query = { eq: () => query, select: async () => ({ data: updatedRows, error: null }) };
    return {
      updates,
      inserts,
      from: () => ({
        update: (values: Record<string, unknown>) => { updates.push(values); return query; },
        insert: async (values: Record<string, unknown>) => { inserts.push(values); return { error: null }; },
      }),
    };
  }

  it('only touches the blocked columns of an existing chain row', async () => {
    const c = client([{ id: 'row' }]);
    expect(await blockVerifactuChain(c, key, 'inv', 'motivo')).toBeNull();
    expect(Object.keys(c.updates[0]).sort()).toEqual(['blocked_at', 'blocked_invoice_id', 'blocked_reason', 'updated_at']);
    expect(c.inserts).toHaveLength(0);
  });

  it('creates a blocked row with empty hash when the chain does not exist', async () => {
    const c = client([]);
    expect(await blockVerifactuChain(c, key, 'inv', 'motivo')).toBeNull();
    expect(c.inserts[0]).toMatchObject({ center_id: 'c1', ultimo_hash: '', blocked_invoice_id: 'inv' });
  });
});

describe('commitVerifactuChain', () => {
  const key = { centerId: 'c1', nifEmisor: 'B1', idSistemaInformatico: '01', numeroInstalacion: 1 };
  const link = { hash: 'H2', invoiceId: 'inv', recordId: 'rec' };

  // Each awaited query consumes the next queued result, in call order.
  function client(results: Array<{ data: unknown[] | null }>) {
    const calls: Array<{ op: string; values?: Record<string, unknown>; filters: Record<string, unknown> }> = [];
    const inserts: Record<string, unknown>[] = [];
    const query = (op: string, values?: Record<string, unknown>) => {
      const call = { op, values, filters: {} as Record<string, unknown> };
      calls.push(call);
      const q = {
        eq: (column: string, value: unknown) => { call.filters[column] = value; return q; },
        select: () => q,
        then: (resolve: (r: unknown) => unknown) => resolve({ ...(results.shift() ?? { data: [] }), error: null }),
      };
      return q;
    };
    return {
      calls,
      inserts,
      from: () => ({
        update: (values: Record<string, unknown>) => query('update', values),
        select: () => query('select'),
        insert: async (values: Record<string, unknown>) => { inserts.push(values); return { error: null }; },
      }),
    };
  }

  it('updates the chain only while holding the lock', async () => {
    const c = client([{ data: [{ id: 'row' }] }]);
    expect(await commitVerifactuChain(c, key, 'L1', link)).toEqual({ ok: true });
    expect(c.calls[0].filters.locked_by).toBe('L1');
    expect(c.calls[0].values).toMatchObject({ ultimo_hash: 'H2', ultima_verifactu_record_id: 'rec' });
  });

  it('reports a lost lock and writes nothing when another process holds it', async () => {
    const c = client([{ data: [] }, { data: [] }]);
    const result = await commitVerifactuChain(c, key, 'L1', link);
    expect(result).toMatchObject({ ok: false, lockLost: true });
    expect(c.inserts).toHaveLength(0);
  });

  it('creates the installation row when the lock is ours but the row is missing', async () => {
    const c = client([{ data: [] }, { data: [{ id: 'lock-row' }] }, { data: [] }]);
    expect(await commitVerifactuChain(c, key, 'L1', link)).toEqual({ ok: true });
    expect(c.inserts[0]).toMatchObject({ center_id: 'c1', ultimo_hash: 'H2', numero_instalacion: 1 });
  });

  it('never overwrites an existing row that is not under our lock', async () => {
    const c = client([{ data: [] }, { data: [{ id: 'lock-row' }] }, { data: [{ id: 'other' }] }]);
    expect(await commitVerifactuChain(c, key, 'L1', link)).toMatchObject({ ok: false, lockLost: true });
    expect(c.inserts).toHaveLength(0);
  });
});
