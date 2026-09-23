import { describe, expect, it } from 'vitest';
import { blockPwaReload, isPwaReloadBlocked, runWhenPwaReloadAllowed } from '@/lib/pwa-update-guard';

describe('pwa-update-guard', () => {
  it('recarga de inmediato cuando no hay grabación', () => {
    let reloaded = 0;
    runWhenPwaReloadAllowed(() => { reloaded += 1; });
    expect(reloaded).toBe(1);
  });

  it('aplaza la recarga mientras se graba y la aplica al liberar', () => {
    const release = blockPwaReload();
    let reloaded = 0;
    runWhenPwaReloadAllowed(() => { reloaded += 1; });
    expect(isPwaReloadBlocked()).toBe(true);
    expect(reloaded).toBe(0);
    release();
    expect(reloaded).toBe(1);
    expect(isPwaReloadBlocked()).toBe(false);
  });

  it('espera al último bloqueo y no recarga dos veces por liberar de más', () => {
    const first = blockPwaReload();
    const second = blockPwaReload();
    let reloaded = 0;
    runWhenPwaReloadAllowed(() => { reloaded += 1; });
    first();
    expect(reloaded).toBe(0);
    second();
    second();
    expect(reloaded).toBe(1);
  });
});
