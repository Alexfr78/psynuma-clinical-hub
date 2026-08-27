import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code } = await req.json();
    if (typeof code !== "string" || !/^[A-Za-z0-9]{8,16}$/.test(code)) {
      return json({ error: "Enlace no válido" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: link, error } = await supabase
      .from("public_short_links")
      .select("id, target_type, target_token, expires_at, revoked_at, access_count")
      .eq("code", code)
      .maybeSingle();

    if (error || !link || link.revoked_at || (link.expires_at && new Date(link.expires_at).getTime() <= Date.now())) {
      return json({ error: "Este enlace no existe o ha caducado" }, 404);
    }

    await supabase
      .from("public_short_links")
      .update({
        access_count: Number(link.access_count || 0) + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq("id", link.id);

    const token = encodeURIComponent(link.target_token);
    const destination = ["session", "session_payment"].includes(link.target_type)
      ? `/cita/${token}`
      : link.target_type === "debt_bono"
        ? `/pagar/${token}?bono=1`
        : link.target_type === "invoice"
          ? `/factura/${token}`
          : `/pagar/${token}`;

    return json({ destination });
  } catch (error) {
    console.error("[resolve-public-short-link] Error:", error);
    return json({ error: "No se pudo abrir el enlace" }, 500);
  }
});
