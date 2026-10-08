import { describe, expect, it, vi } from 'vitest';
import {
  acquireVerifactuChainLock,
  blockVerifactuChain,
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
