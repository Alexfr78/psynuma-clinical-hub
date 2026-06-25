import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type FiscalRole = "admin" | "professional";

export type FiscalAccessContext = {
  actorType: "user" | "service_role";
  userId: string | null;
  centerId: string;
  roles: FiscalRole[];
};

type FiscalAccessResult =
  | { ok: true; context: FiscalAccessContext }
  | { ok: false; response: Response };

function jsonResponse(
  status: number,
  corsHeaders: Record<string, string>,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

export async function authorizeFiscalInvoiceRequest(
  req: Request,
  supabase: SupabaseClient,
  params: {
    invoiceId: string;
    invoiceCenterId: string | null | undefined;
    allowedRoles?: FiscalRole[];
    corsHeaders: Record<string, string>;
  },
): Promise<FiscalAccessResult> {
  const { invoiceId, invoiceCenterId, corsHeaders } = params;
  const allowedRoles = params.allowedRoles ?? ["admin"];

  if (!invoiceCenterId) {
    return {
      ok: false,
      response: jsonResponse(400, corsHeaders, {
        error: "La factura no tiene centro asociado",
      }),
    };
  }

  return authorizeFiscalCenterRequest(req, supabase, {
    centerId: invoiceCenterId,
    allowedRoles,
    corsHeaders,
    deniedMessage: "No tienes permiso para operar sobre esta factura",
    logContext: { invoice_id: invoiceId },
  });
}

export async function authorizeFiscalCenterRequest(
  req: Request,
  supabase: SupabaseClient,
  params: {
    centerId?: string | null;
    allowedRoles?: FiscalRole[];
    corsHeaders: Record<string, string>;
    deniedMessage?: string;
    logContext?: Record<string, unknown>;
  },
): Promise<FiscalAccessResult> {
  const { centerId, corsHeaders } = params;
  const allowedRoles = params.allowedRoles ?? ["admin"];

  const token = getBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: jsonResponse(401, corsHeaders, { error: "No autorizado" }),
    };
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) {
    if (!centerId) {
      return {
        ok: false,
        response: jsonResponse(400, corsHeaders, {
          error: "center_id es requerido para llamadas internas",
        }),
      };
    }

    return {
      ok: true,
      context: {
        actorType: "service_role",
        userId: null,
        centerId,
        roles: [],
      },
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;

  if (userError || !user) {
    return {
      ok: false,
      response: jsonResponse(401, corsHeaders, { error: "Token no valido" }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("center_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_active === false) {
    return {
      ok: false,
      response: jsonResponse(403, corsHeaders, {
        error: "Usuario sin perfil activo",
      }),
    };
  }

  if (!profile.center_id) {
    return {
      ok: false,
      response: jsonResponse(403, corsHeaders, {
        error: "Usuario sin centro asignado",
      }),
    };
  }

  if (centerId && profile.center_id !== centerId) {
    console.warn("[fiscalAuth] Cross-center fiscal access blocked", {
      user_id: user.id,
      user_center_id: profile.center_id,
      requested_center_id: centerId,
      ...params.logContext,
    });
    return {
      ok: false,
      response: jsonResponse(403, corsHeaders, {
        error: params.deniedMessage || "No tienes permiso para esta operacion fiscal",
      }),
    };
  }

  const resolvedCenterId = centerId || profile.center_id;

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("center_id", resolvedCenterId)
    .in("role", allowedRoles);

  if (rolesError || !roles || roles.length === 0) {
    return {
      ok: false,
      response: jsonResponse(403, corsHeaders, {
        error: "Solo administradores pueden realizar operaciones fiscales",
      }),
    };
  }

  return {
    ok: true,
    context: {
      actorType: "user",
      userId: user.id,
      centerId: resolvedCenterId,
      roles: roles.map((row: { role: FiscalRole }) => row.role),
    },
  };
}
