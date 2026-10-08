export interface VerifactuChainLockClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: string | null; error?: unknown }>;
}

export interface VerifactuChainLockOptions {
  maxAttempts?: number;
  retryMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 15;
const DEFAULT_RETRY_MS = 2000;

export async function acquireVerifactuChainLock(
  supabase: VerifactuChainLockClient,
  centerId: string,
  nifEmisor: string,
  options: VerifactuChainLockOptions = {},
): Promise<string | null> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const sleep = options.sleep ?? ((milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: lockId } = await supabase.rpc('acquire_verifactu_chain_lock_v2', {
      p_center_id: centerId,
      p_nif_emisor: nifEmisor,
      p_lock_timeout_seconds: 30,
    });

    if (lockId) {
      console.log(`[VERIFACTU:LOCK] Acquired lock ${lockId} on attempt ${attempt + 1}`);
      return lockId;
    }

    console.log(`[VERIFACTU:LOCK] Attempt ${attempt + 1}/${maxAttempts} failed, waiting ${retryMs}ms...`);
    await sleep(retryMs);
  }

  console.error('[VERIFACTU:LOCK] Could not acquire chain lock after max attempts');
  return null;
}

export async function releaseVerifactuChainLock(
  supabase: VerifactuChainLockClient,
  centerId: string,
  lockId: string,
): Promise<void> {
  await supabase.rpc('release_verifactu_chain_lock_v2', {
    p_center_id: centerId,
    p_lock_id: lockId,
  });
  console.log('[VERIFACTU:LOCK] Released chain lock');
}

export interface VerifactuChainKey {
  centerId: string;
  nifEmisor: string;
  idSistemaInformatico: string;
  numeroInstalacion: number;
}

interface ChainBlockQuery {
  eq(column: string, value: unknown): ChainBlockQuery;
  select(columns: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

interface ChainBlockClient {
  from(table: string): {
    update(values: Record<string, unknown>): ChainBlockQuery;
    insert(values: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

/**
 * Marks the chain as blocked until it is reconciled with the AEAT. Only touches
 * the blocked_* columns: the stored hash/pointers are never rewritten here.
 * Returns an error message, or null on success.
 */
export async function blockVerifactuChain(
  supabase: unknown,
  key: VerifactuChainKey,
  invoiceId: string,
  reason: string,
): Promise<string | null> {
  const client = supabase as ChainBlockClient;
  const now = new Date().toISOString();
  const blockFields = {
    blocked_reason: reason,
    blocked_invoice_id: invoiceId,
    blocked_at: now,
    updated_at: now,
  };

  const { data, error } = await client
    .from('verifactu_chain_status')
    .update(blockFields)
    .eq('center_id', key.centerId)
    .eq('nif_emisor', key.nifEmisor)
    .eq('id_sistema_informatico', key.idSistemaInformatico)
    .eq('numero_instalacion', key.numeroInstalacion)
    .select('id');
  if (error) return error.message;
  if (data && data.length > 0) return null;

  // No chain row yet (the lost record was the first one): create it already blocked.
  const { error: insertError } = await client.from('verifactu_chain_status').insert({
    center_id: key.centerId,
    nif_emisor: key.nifEmisor,
    id_sistema_informatico: key.idSistemaInformatico,
    numero_instalacion: key.numeroInstalacion,
    ultimo_hash: '',
    ...blockFields,
  });
  return insertError ? insertError.message : null;
}
