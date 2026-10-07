export interface VerifactuSoftwareRow {
  verifactu_software_name?: string | null;
  verifactu_software_nif?: string | null;
  verifactu_software_version?: string | null;
  verifactu_sistema_informatico?: string | null;
}

export interface VerifactuSoftwareIdentity {
  name: string;
  nif: string;
  version: string;
  systemName: string;
}

export type VerifactuSoftwareIdentityResult =
  | { ok: true; identity: VerifactuSoftwareIdentity }
  | { ok: false; error: string };

export const VERIFACTU_SOFTWARE_IDENTITY_ERROR =
  'Falta la identificación del software Verifactu (centro proveedor). Configúrala antes de registrar facturas.';

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveVerifactuSoftwareIdentity(
  row: VerifactuSoftwareRow | null | undefined,
): VerifactuSoftwareIdentityResult {
  const name = nonEmpty(row?.verifactu_software_name);
  const nif = nonEmpty(row?.verifactu_software_nif);
  const version = nonEmpty(row?.verifactu_software_version);

  if (!name || !nif || !version) {
    return { ok: false, error: VERIFACTU_SOFTWARE_IDENTITY_ERROR };
  }

  return {
    ok: true,
    identity: {
      name,
      nif,
      version,
      systemName: nonEmpty(row?.verifactu_sistema_informatico) || 'PSYCMA',
    },
  };
}

interface SoftwareIdentitySupabaseClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): PromiseLike<{ data: VerifactuSoftwareRow | null; error: { message?: string } | null }>;
      };
    };
  };
}

export async function loadVerifactuSoftwareIdentity(
  supabase: unknown,
): Promise<VerifactuSoftwareIdentityResult> {
  const client = supabase as SoftwareIdentitySupabaseClient;
  const { data, error } = await client
    .from('centers')
    .select('verifactu_software_name, verifactu_software_nif, verifactu_sistema_informatico, verifactu_software_version')
    .eq('is_software_provider', true)
    .maybeSingle();

  if (error) {
    console.error('[VERIFACTU:SOFTWARE] No se pudo cargar el centro proveedor:', error.message || error);
    return { ok: false, error: VERIFACTU_SOFTWARE_IDENTITY_ERROR };
  }

  return resolveVerifactuSoftwareIdentity(data);
}
