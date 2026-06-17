import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createClient(supabaseUrl, serviceKey);

  // Fetch all confirmed sessions that have a linked Google Calendar event
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, professional_id, google_calendar_event_id, status")
    .eq("status", "confirmed")
    .not("google_calendar_event_id", "is", null);

  if (error) {
    console.error("[BACKFILL] Error fetching sessions:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`[BACKFILL] Found ${sessions?.length ?? 0} confirmed sessions with Google Calendar events`);

  const stats = { total: sessions?.length ?? 0, succeeded: 0, failed: 0, skipped: 0 };
  const failures: { id: string; error: string }[] = [];

  for (const session of sessions ?? []) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/update-google-calendar-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
          "apikey": serviceKey,
        },
        body: JSON.stringify({
          professional_id: session.professional_id,
          event_id: session.google_calendar_event_id,
          color_id: "2", // sage green = confirmed
        }),
      });

      const result = await response.json();

      if (result.success) {
        stats.succeeded++;
        console.log(`[BACKFILL] ✓ Session ${session.id} (event ${session.google_calendar_event_id})`);
      } else if (result.skipped) {
        stats.skipped++;
      } else {
        stats.failed++;
        failures.push({ id: session.id, error: result.error || "unknown" });
        console.warn(`[BACKFILL] ✗ Session ${session.id}: ${result.error}`);
      }
    } catch (err) {
      stats.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ id: session.id, error: msg });
      console.error(`[BACKFILL] ✗ Session ${session.id}:`, err);
    }

    // 200 ms between calls — stays well within Google's 600 req/min quota
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("[BACKFILL] Done:", stats);

  return new Response(
    JSON.stringify({ success: true, stats, failures }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
