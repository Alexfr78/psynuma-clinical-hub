import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertCondition {
  field: string;
  operator: string;
  value: string;
}

interface AlertRule {
  id: string;
  name: string;
  conditions: AlertCondition[];
  logic_operator: "AND" | "OR";
  consecutive_count: number;
  severity: "warning" | "critical";
}

const OPERATOR_LABELS: Record<string, string> = {
  lt: "menor que",
  lte: "menor o igual que",
  gt: "mayor que",
  gte: "mayor o igual que",
  eq: "igual a",
  neq: "distinto de",
  contains: "contiene",
};

function evaluateCondition(
  condition: AlertCondition,
  values: Record<string, unknown>,
): boolean {
  const raw = values[condition.field];
  if (raw === undefined || raw === null) return false;

  const op = condition.operator;

  // Numeric operators
  if (["lt", "lte", "gt", "gte", "eq", "neq"].includes(op)) {
    const numVal = Number(raw);
    const numCond = Number(condition.value);
    if (Number.isNaN(numVal) || Number.isNaN(numCond)) {
      // Fallback to string comparison for eq/neq on non-numeric
      const a = String(raw).toLowerCase();
      const b = String(condition.value).toLowerCase();
      if (op === "eq") return a === b;
      if (op === "neq") return a !== b;
      return false;
    }
    switch (op) {
      case "lt": return numVal < numCond;
      case "lte": return numVal <= numCond;
      case "gt": return numVal > numCond;
      case "gte": return numVal >= numCond;
      case "eq": return numVal === numCond;
      case "neq": return numVal !== numCond;
    }
  }

  // String/select operators
  if (op === "contains") {
    return String(raw).toLowerCase().includes(String(condition.value).toLowerCase());
  }

  return false;
}

function evaluateRule(
  rule: AlertRule,
  values: Record<string, unknown>,
): boolean {
  if (!rule.conditions || rule.conditions.length === 0) return false;
  return rule.logic_operator === "AND"
    ? rule.conditions.every((c) => evaluateCondition(c, values))
    : rule.conditions.some((c) => evaluateCondition(c, values));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { entryId } = await req.json();
    if (!entryId || typeof entryId !== "string") {
      return new Response(
        JSON.stringify({ error: "entryId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // STEP 1 - Load entry with template and patient
    const { data: entry, error: entryErr } = await supabase
      .from("autoregistro_entries")
      .select("*, autoregistro_templates(id, name, fields), patients(id, first_name, last_name)")
      .eq("id", entryId)
      .single();

    if (entryErr || !entry) {
      console.error("Entry not found:", entryErr?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Entry not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const template = entry.autoregistro_templates as { id: string; name: string; fields: unknown[] };
    const patient = entry.patients as { id: string; first_name: string; last_name: string };
    const entryValues = (entry.values || {}) as Record<string, unknown>;

    // STEP 2 - Load active rules
    const { data: rules, error: rulesErr } = await supabase
      .from("autoregistro_alert_rules")
      .select("*")
      .eq("template_id", template.id)
      .eq("is_active", true);

    if (rulesErr) {
      console.error("Error loading rules:", rulesErr.message);
      return new Response(
        JSON.stringify({ success: false, error: "Error loading rules" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, alertsFired: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // STEP 3 & 4 - Evaluate rules and check consecutives
    const firedRules: AlertRule[] = [];

    for (const rule of rules as AlertRule[]) {
      if (!evaluateRule(rule, entryValues)) continue;

      if (rule.consecutive_count > 1) {
        const needed = rule.consecutive_count - 1;
        const { data: prevEntries } = await supabase
          .from("autoregistro_entries")
          .select("values")
          .eq("patient_id", entry.patient_id)
          .eq("template_id", entry.template_id)
          .lt("submitted_at", entry.submitted_at)
          .order("submitted_at", { ascending: false })
          .limit(needed);

        if (!prevEntries || prevEntries.length < needed) continue;

        const allMatch = prevEntries.every((prev: { values: Record<string, unknown> }) =>
          evaluateRule(rule, (prev.values || {}) as Record<string, unknown>)
        );
        if (!allMatch) continue;
      }

      firedRules.push(rule);
    }

    // STEP 5
    if (firedRules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, alertsFired: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // STEP 6a - Find professional
    let professionalId: string | null = null;

    const { data: recentSession } = await supabase
      .from("sessions")
      .select("professional_id")
      .eq("patient_id", entry.patient_id)
      .eq("center_id", entry.center_id)
      .order("session_date", { ascending: false })
      .limit(1)
      .single();

    if (recentSession) {
      professionalId = recentSession.professional_id;
    } else {
      const { data: fallbackProf } = await supabase
        .from("profiles")
        .select("id")
        .eq("center_id", entry.center_id)
        .limit(1)
        .single();
      professionalId = fallbackProf?.id || null;
    }

    if (!professionalId) {
      console.error("No professional found for center");
      return new Response(
        JSON.stringify({ success: false, error: "No professional found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // STEP 6b - Get professional contact info
    const { data: prof } = await supabase
      .from("profiles")
      .select("phone, email")
      .eq("id", professionalId)
      .single();

    const profPhone = prof?.phone || null;
    const profEmail = prof?.email || null;

    // STEP 6c - Check wasender settings
    const { data: center } = await supabase
      .from("centers")
      .select("wasender_enabled, wasender_emergency_stop")
      .eq("id", entry.center_id)
      .single();

    const wasenderEnabled = center?.wasender_enabled === true &&
      (center?.wasender_emergency_stop === null || center?.wasender_emergency_stop === false);

    // STEP 6d - Check WhatsApp session
    let whatsappAvailable = false;
    if (wasenderEnabled && profPhone) {
      const { data: waSession } = await supabase
        .from("whatsapp_sessions")
        .select("id")
        .eq("center_id", entry.center_id)
        .eq("status", "connected")
        .limit(1)
        .single();
      whatsappAvailable = !!waSession;
    }

    // STEP 6e - Build message
    const isCritical = firedRules.some((r) => r.severity === "critical");
    const icon = isCritical ? "⛔" : "⚠️";
    const title = isCritical ? "ALERTA CRÍTICA" : "AVISO CLÍNICO";

    const submittedAt = new Date(entry.submitted_at);
    const dateStr = submittedAt.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = submittedAt.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const ruleLines = firedRules.map((rule) => {
      const condDetails = rule.conditions.map((c) => {
        const opLabel = OPERATOR_LABELS[c.operator] || c.operator;
        const actual = entryValues[c.field] ?? "N/A";
        return `${c.field} ${opLabel} ${c.value} → Valor registrado: ${actual}`;
      }).join("; ");
      return `- ${rule.name}: ${condDetails}`;
    }).join("\n");

    const message = `${icon} ${title} - ${patient.first_name} ${patient.last_name}\n\nEl autoregistro "${template.name}" enviado el ${dateStr} a las ${timeStr} ha activado las siguientes alertas:\n\n${ruleLines}\n\nRevisa la aplicación para valorar si se requiere intervención urgente.`;

    // STEP 6f/g - Send notification
    let whatsappSent = false;
    let emailSent = false;
    let errorMessage: string | null = null;

    if (whatsappAvailable) {
      try {
        const { error: waErr } = await supabase.functions.invoke("wasender-send-message", {
          body: {
            phone: profPhone,
            message,
            message_type: "clinical_alert",
            patient_id: entry.patient_id,
          },
        });
        if (waErr) {
          console.error("WhatsApp send error:", waErr.message);
          errorMessage = waErr.message;
        } else {
          whatsappSent = true;
        }
      } catch (e) {
        console.error("WhatsApp send exception:", e);
        errorMessage = String(e);
      }
    }

    if (!whatsappSent && profEmail) {
      try {
        const subject = isCritical
          ? `[Alerta clínica] ${patient.first_name} ${patient.last_name}`
          : `[Aviso clínico] ${patient.first_name} ${patient.last_name}`;

        const { data: notif, error: notifErr } = await supabase
          .from("notifications")
          .insert({
            center_id: entry.center_id,
            patient_id: entry.patient_id,
            type: "email",
            recipient: profEmail,
            subject,
            message,
            status: "pending",
          })
          .select("id")
          .single();

        if (notifErr) {
          console.error("Notification insert error:", notifErr.message);
          errorMessage = notifErr.message;
        } else if (notif) {
          const { error: sendErr } = await supabase.functions.invoke("send-notification", {
            body: { notificationId: notif.id },
          });
          if (sendErr) {
            console.error("Email send error:", sendErr.message);
            errorMessage = sendErr.message;
          } else {
            emailSent = true;
          }
        }
      } catch (e) {
        console.error("Email send exception:", e);
        errorMessage = String(e);
      }
    }

    // STEP 6h - Insert alert logs
    const alertLogs = firedRules.map((rule) => ({
      entry_id: entryId,
      rule_id: rule.id,
      center_id: entry.center_id,
      patient_id: entry.patient_id,
      notification_method: whatsappSent ? "whatsapp" : emailSent ? "email" : "none",
      success: whatsappSent || emailSent,
      error_message: errorMessage,
      severity: rule.severity,
    }));

    const { error: logErr } = await supabase
      .from("autoregistro_alert_logs")
      .insert(alertLogs);

    if (logErr) {
      console.error("Error inserting alert logs:", logErr.message);
    }

    // STEP 6i
    return new Response(
      JSON.stringify({ success: true, alertsFired: firedRules.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unhandled error in check-autoregistro-alerts:", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
