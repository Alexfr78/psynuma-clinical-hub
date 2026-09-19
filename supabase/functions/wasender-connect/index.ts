import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WASENDER_API_URL = "https://www.wasenderapi.com/api";

// Map WasenderAPI statuses to our DB-valid statuses
const STATUS_MAP: Record<string, string> = {
  "connected": "connected",
  "working": "connected",
  "need_scan": "need_scan",
  "scan_qr_code": "need_scan",
  "stopped": "disconnected",
  "logged_out": "disconnected",
  "disconnected": "disconnected",
};

const mapStatus = (raw: string | null | undefined, fallback = "disconnected") =>
  STATUS_MAP[(raw ?? "").toLowerCase()] ?? fallback;

// Digits only, "+" prefix. A bare 9-digit number is assumed to be Spanish.
const normalizePhone = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 9) digits = `34${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "No authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const wasenderApiKey = Deno.env.get("WASENDER_API_KEY");
    const wasenderToken = Deno.env.get("WASENDER_PERSONAL_ACCESS_TOKEN");

    if (!wasenderApiKey || !wasenderToken) {
      return json({
        error: "WasenderAPI credentials not configured",
        code: "CREDENTIALS_MISSING",
      }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Get user's center
    const { data: profile } = await supabase
      .from("profiles")
      .select("center_id")
      .eq("id", user.id)
      .single();

    if (!profile?.center_id) {
      return json({ error: "No center found" }, 400);
    }

    const body = await req.json().catch(() => ({}));

    const authHeaders = {
      "Authorization": `Bearer ${wasenderToken}`,
      "Accept": "application/json",
    };

    // The WasenderAPI account is shared by every center, so the session must be
    // resolved from THIS center's own row — never from the account-wide list.
    const { data: existingRow } = await supabase
      .from("whatsapp_sessions")
      .select("wasender_session_id, phone_number, name")
      .eq("center_id", profile.center_id)
      .maybeSingle();

    let qrCode: string | null = null;
    let sessionStatus = "disconnected";
    let wasenderSessionId: string | null = null;
    let phoneNumber: string | null = null;
    let sessionName: string | null = null;
    let newApiKey: string | null = null;
    let newWebhookSecret: string | null = null;

    // 1) Center already has a session: look up only that one.
    if (existingRow?.wasender_session_id) {
      const res = await fetch(
        `${WASENDER_API_URL}/whatsapp-sessions/${existingRow.wasender_session_id}`,
        { method: "GET", headers: authHeaders },
      );

      if (res.ok) {
        const payload = await res.json();
        const session = payload.data ?? payload;
        wasenderSessionId = String(existingRow.wasender_session_id);
        sessionName = session.name ?? existingRow.name ?? null;
        phoneNumber = session.phone_number ?? existingRow.phone_number ?? null;
        sessionStatus = mapStatus(session.status);
        console.log(`Existing session ${wasenderSessionId} for center, status: ${session.status} -> ${sessionStatus}`);
      } else if (res.status === 404) {
        console.warn(`Session ${existingRow.wasender_session_id} no longer exists in WasenderAPI, creating a new one`);
      } else {
        const errorText = await res.text();
        console.error("WasenderAPI session error:", errorText);
        return json({
          error: "Error connecting to WasenderAPI",
          details: errorText.substring(0, 500),
        }, 500);
      }
    }

    // 2) No usable session for this center: create one with its own number.
    if (!wasenderSessionId) {
      const phone = normalizePhone(body?.phone_number) ?? normalizePhone(existingRow?.phone_number);
      if (!phone) {
        return json({
          success: false,
          error: "PHONE_REQUIRED",
          code: "PHONE_REQUIRED",
        });
      }

      const newSessionName = `psycma-${profile.center_id.substring(0, 8)}`;
      console.log("Creating new WasenderAPI session for center", profile.center_id);

      const createResponse = await fetch(`${WASENDER_API_URL}/whatsapp-sessions`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSessionName,
          phone_number: phone,
          account_protection: true,
          log_messages: true,
        }),
      });

      if (!createResponse.ok) {
        const createError = await createResponse.text();
        console.error("Error creating session:", createResponse.status, createError.substring(0, 300));
        const isLimit = /limit|subscription|plan/i.test(createError);
        return json({
          success: false,
          error: isLimit ? "SESSION_LIMIT" : "CREATE_FAILED",
          code: isLimit ? "SESSION_LIMIT" : "CREATE_FAILED",
          details: createError.substring(0, 500),
        });
      }

      const createData = await createResponse.json();
      const created = createData.data ?? createData;
      wasenderSessionId = created.id != null ? String(created.id) : null;
      sessionName = created.name ?? newSessionName;
      phoneNumber = created.phone_number ?? phone;
      sessionStatus = mapStatus(created.status, "need_scan");
      newApiKey = created.api_key ?? null;
      newWebhookSecret = created.webhook_secret ?? null;
      console.log("Created new session:", wasenderSessionId);
    }

    // 3) Session exists but is not connected: connect it and fetch the QR.
    if (wasenderSessionId && sessionStatus !== "connected") {
      const connectResponse = await fetch(
        `${WASENDER_API_URL}/whatsapp-sessions/${wasenderSessionId}/connect`,
        { method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" } },
      );

      if (connectResponse.ok) {
        const connectData = await connectResponse.json();
        console.log("Connect response:", JSON.stringify(connectData).substring(0, 500));
        qrCode = connectData.data?.qrCode || connectData.qrCode || connectData.data?.qr || connectData.qr || null;
        if (connectData.data?.status) {
          sessionStatus = mapStatus(connectData.data.status, "need_scan");
        }
      } else {
        const connectError = await connectResponse.text();
        console.log("Connect response not ok:", connectError.substring(0, 300));
      }

      if (!qrCode) {
        const qrResponse = await fetch(
          `${WASENDER_API_URL}/whatsapp-sessions/${wasenderSessionId}/qrcode`,
          { method: "GET", headers: authHeaders },
        );

        if (qrResponse.ok) {
          const qrData = await qrResponse.json();
          qrCode = qrData.data?.qrCode || qrData.qrCode || qrData.data?.qr || qrData.qr || null;
        } else {
          const qrError = await qrResponse.text();
          console.log("QR response not ok:", qrError.substring(0, 300));
        }
      }

      if (qrCode) sessionStatus = "need_scan";
    }

    // Upsert session in database
    const upsertData: Record<string, unknown> = {
      center_id: profile.center_id,
      professional_id: user.id,
      wasender_session_id: wasenderSessionId,
      name: sessionName,
      status: sessionStatus,
      qr_code: qrCode,
      phone_number: phoneNumber,
      updated_at: new Date().toISOString(),
    };

    if (newApiKey) upsertData.api_key = newApiKey;
    if (newWebhookSecret) upsertData.webhook_secret = newWebhookSecret;

    if (sessionStatus === "connected") {
      upsertData.last_connected_at = new Date().toISOString();
    }

    const { data: upsertedData, error: upsertError } = await supabase
      .from("whatsapp_sessions")
      .upsert(upsertData, {
        onConflict: "center_id",
      })
      .select()
      .single();

    if (upsertError) {
      console.error("Error upserting session:", upsertError);
      // Return the data from WasenderAPI even if DB save fails
    } else {
      console.log("Session saved to database:", upsertedData?.id);
    }

    return json({
      success: true,
      status: sessionStatus,
      qr_code: qrCode,
      session_id: wasenderSessionId,
      phone_number: phoneNumber,
    });
  } catch (error) {
    console.error("[wasender-connect] Unhandled error:", error);
    return json({ error: "Error interno del servidor" }, 500);
  }
});
