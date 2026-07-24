import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { validateInviteProfessionalInput } from "../_shared/inviteProfessionalValidation.ts";

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405, corsHeaders);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const accessToken = authHeader?.replace(/^Bearer\s+/i, "");

    if (!authHeader || !accessToken) {
      return jsonResponse({ error: "No autorizado" }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const appBaseUrl = Deno.env.get("APP_BASE_URL")?.replace(/\/+$/, "");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !appBaseUrl) {
      console.error("[invite-professional] Missing required environment configuration");
      return jsonResponse(
        { error: "La invitación no está configurada correctamente" },
        500,
        corsHeaders,
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    const requestingUser = userData.user;

    if (userError || !requestingUser) {
      return jsonResponse({ error: "No autorizado" }, 401, corsHeaders);
    }

    const { data: requestingProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("center_id")
      .eq("id", requestingUser.id)
      .maybeSingle();

    if (profileError || !requestingProfile?.center_id) {
      return jsonResponse({ error: "No tienes un centro asociado" }, 403, corsHeaders);
    }

    const centerId = requestingProfile.center_id;
    const { data: adminRole, error: roleError } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("user_id", requestingUser.id)
      .eq("center_id", centerId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !adminRole) {
      return jsonResponse(
        { error: "Solo los administradores pueden invitar profesionales" },
        403,
        corsHeaders,
      );
    }

    const validation = validateInviteProfessionalInput(await req.json());
    if ("error" in validation) {
      return jsonResponse({ error: validation.error }, 400, corsHeaders);
    }

    const { firstName, lastName, email } = validation.data;
    const { data: invitation, error: invitationError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${appBaseUrl}/auth`,
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      });

    if (invitationError || !invitation.user) {
      const isExistingUser =
        invitationError?.code === "email_exists" ||
        invitationError?.code === "user_already_exists" ||
        /already|registered|exists/i.test(invitationError?.message ?? "");

      console.error("[invite-professional] Invitation failed:", invitationError);
      return jsonResponse(
        {
          error: isExistingUser
            ? "Ya existe una cuenta con este email"
            : "No se pudo enviar la invitación. Inténtalo de nuevo",
        },
        isExistingUser ? 409 : 500,
        corsHeaders,
      );
    }

    const invitedUserId = invitation.user.id;
    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({
        center_id: centerId,
        first_name: firstName,
        last_name: lastName,
        is_active: true,
      })
      .eq("id", invitedUserId);

    if (profileUpdateError) {
      console.error("[invite-professional] Profile assignment failed:", profileUpdateError);
      await adminClient.auth.admin.deleteUser(invitedUserId);
      return jsonResponse(
        { error: "No se pudo vincular el profesional al centro" },
        500,
        corsHeaders,
      );
    }

    const { error: professionalRoleError } = await adminClient
      .from("user_roles")
      .insert({
        user_id: invitedUserId,
        center_id: centerId,
        role: "professional",
      });

    if (professionalRoleError) {
      console.error("[invite-professional] Role assignment failed:", professionalRoleError);
      await adminClient.auth.admin.deleteUser(invitedUserId);
      return jsonResponse(
        { error: "No se pudo asignar el rol profesional" },
        500,
        corsHeaders,
      );
    }

    return jsonResponse(
      {
        success: true,
        professional: {
          id: invitedUserId,
          email,
          first_name: firstName,
          last_name: lastName,
        },
      },
      201,
      corsHeaders,
    );
  } catch (error) {
    console.error("[invite-professional] Unexpected error:", error);
    return jsonResponse(
      { error: "Error interno al enviar la invitación" },
      500,
      getCorsHeaders(req),
    );
  }
});
