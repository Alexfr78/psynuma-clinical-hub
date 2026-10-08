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
// Must outlast the longest sign/cancel run (AEAT call included) so a slow AEAT
// response never lets a second process take the chain mid-flight.
export const VERIFACTU_CHAIN_LOCK_TIMEOUT_SECONDS = 180;
// Max wait for an AEAT response, so a run always ends well inside the lock.
export const VERIFACTU_AEAT_TIMEOUT_MS = 60_000;

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
      p_lock_timeout_seconds: VERIFACTU_CHAIN_LOCK_TIMEOUT_SECONDS,
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

type ChainResult = { data: unknown[] | null; error: { message: string } | null };

interface ChainQuery extends PromiseLike<ChainResult> {
  eq(column: string, value: unknown): ChainQuery;
  select(columns: string): ChainQuery;
}

interface ChainClient {
  from(table: string): {
    select(columns: string): ChainQuery;
    update(values: Record<string, unknown>): ChainQuery;
    insert(values: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

function eqKey(query: ChainQuery, key: VerifactuChainKey): ChainQuery {
  return query
    .eq('center_id', key.centerId)
    .eq('nif_emisor', key.nifEmisor)
    .eq('id_sistema_informatico', key.idSistemaInformatico)
    .eq('numero_instalacion', key.numeroInstalacion);
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
  const client = supabase as ChainClient;
  const now = new Date().toISOString();
  const blockFields = {
    blocked_reason: reason,
    blocked_invoice_id: invoiceId,
    blocked_at: now,
    updated_at: now,
  };

  const { data, error } = await eqKey(
    client.from('verifactu_chain_status').update(blockFields),
    key,
  ).select('id');
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

export type CommitVerifactuChainResult =
  | { ok: true }
  | { ok: false; lockLost: boolean; error: string };

/**
 * Advances the chain to a newly accepted record, but only while we still hold
 * the chain lock. If the lock expired and another process took it, nothing is
 * written and lockLost is true: the caller must block the chain.
 */
export async function commitVerifactuChain(
  supabase: unknown,
  key: VerifactuChainKey,
  lockId: string,
  link: { hash: string; invoiceId: string; recordId: string },
): Promise<CommitVerifactuChainResult> {
  const client = supabase as ChainClient;
  const fields = {
    ultimo_hash: link.hash,
    ultima_factura_id: link.invoiceId,
    ultima_verifactu_record_id: link.recordId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await eqKey(
    client.from('verifactu_chain_status').update(fields),
    key,
  ).eq('locked_by', lockId).select('id');
  if (error) return { ok: false, lockLost: false, error: error.message };
  if (data && data.length > 0) return { ok: true };

  // No row matched: either the lock is no longer ours, or this installation's
  // row does not exist yet (the lock row is per center + NIF).
  const { data: held, error: heldError } = await client
    .from('verifactu_chain_status')
    .select('id')
    .eq('center_id', key.centerId)
    .eq('locked_by', lockId);
  if (heldError) return { ok: false, lockLost: false, error: heldError.message };
  if (!held || held.length === 0) {
    return { ok: false, lockLost: true, error: 'Se perdió el bloqueo de la cadena Verifactu durante el registro' };
  }

  const { data: existing, error: existingError } = await eqKey(
    client.from('verifactu_chain_status').select('id'),
    key,
  );
  if (existingError) return { ok: false, lockLost: false, error: existingError.message };
  if (existing && existing.length > 0) {
    // Row exists but is not the one we locked: never overwrite it blindly.
    return { ok: false, lockLost: true, error: 'La fila de la cadena Verifactu no está bajo nuestro bloqueo' };
  }

  const { error: insertError } = await client.from('verifactu_chain_status').insert({
    center_id: key.centerId,
    nif_emisor: key.nifEmisor,
    id_sistema_informatico: key.idSistemaInformatico,
    numero_instalacion: key.numeroInstalacion,
    ...fields,
  });
  return insertError ? { ok: false, lockLost: false, error: insertError.message } : { ok: true };
}
