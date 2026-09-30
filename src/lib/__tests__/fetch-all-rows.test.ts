import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows, fetchInChunks } from '@/lib/fetch-all-rows';

/** Simula PostgREST: devuelve el tramo pedido de `rows`, como mucho `cap` filas. */
function fakeTable(rows: number[], cap = 1000) {
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, Math.min(to + 1, from + cap)),
    error: null,
  }));
}

describe('fetchAllRows', () => {
  it('lee más allá del tope de 1.000 filas', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i);
    const build = fakeTable(rows);
    expect(await fetchAllRows(build)).toEqual(rows);
    expect(build).toHaveBeenCalledTimes(3);
  });

  it('hace una petición extra solo cuando el último tramo viene lleno', async () => {
    const build = fakeTable(Array.from({ length: 1000 }, (_, i) => i));
    expect(await fetchAllRows(build)).toHaveLength(1000);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('propaga el error de PostgREST', async () => {
    const err = new Error('boom');
    await expect(fetchAllRows(async () => ({ data: null, error: err }))).rejects.toBe(err);
  });

  it('una tabla vacía devuelve []', async () => {
    expect(await fetchAllRows(fakeTable([]))).toEqual([]);
  });
});

describe('fetchInChunks', () => {
  it('parte los ids en tandas, sin repetidos, y concatena en orden', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const seen: string[][] = [];
    const rows = await fetchInChunks([...ids, 'id-0'], async (chunk) => {
      seen.push(chunk);
      return { data: chunk.map((id) => ({ id })), error: null };
    });
    expect(seen.map((c) => c.length)).toEqual([200, 200, 50]);
    expect(rows.map((r) => r.id)).toEqual(ids);
  });

  it('sin ids no hace peticiones', async () => {
    const build = vi.fn();
    expect(await fetchInChunks([], build)).toEqual([]);
    expect(build).not.toHaveBeenCalled();
  });
});
