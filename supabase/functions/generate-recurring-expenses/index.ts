import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_DUE_DAYS = 7;

interface RecurringTemplate {
  id: string;
  center_id: string;
  category_id: string;
  supplier_id: string | null;
  description: string;
  default_amount: number;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  day_of_period: number;
  anchor_month: number | null;
  is_active: boolean;
  starts_on: string;
  ends_on: string | null;
  default_payment_method: string | null;
  vat_rate: number | null;
  irpf_rate: number | null;
  last_generated_period: string | null;
}

function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map((part) => parseInt(part, 10));
  return { y, m, d };
}

function toISODate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isAlreadyGenerated(lastGeneratedPeriod: string | null, periodStart: string): boolean {
  return !!lastGeneratedPeriod && lastGeneratedPeriod >= periodStart;
}

/**
 * Computes the period to generate today for a recurring template, or null if
 * nothing should be generated today. Mirrors src/lib/expense-recurrence.ts
 * (kept in sync manually — Deno edge functions and the Vite frontend do not
 * share a module graph in this project).
 */
function computeRecurringExpensePeriod(template: RecurringTemplate, todayISO: string): string | null {
  if (todayISO < template.starts_on) return null;
  if (template.ends_on && todayISO > template.ends_on) return null;

  const today = parseISODate(todayISO);
  if (today.d !== template.day_of_period) return null;

  if (template.frequency === 'monthly') {
    const periodStart = toISODate(today.y, today.m, 1);
    return isAlreadyGenerated(template.last_generated_period, periodStart) ? null : periodStart;
  }

  if (template.frequency === 'quarterly') {
    const anchor = template.anchor_month ?? 1;
    const diff = ((today.m - anchor) % 3 + 3) % 3;
    if (diff !== 0) return null;
    const periodStart = toISODate(today.y, today.m, 1);
    return isAlreadyGenerated(template.last_generated_period, periodStart) ? null : periodStart;
  }

  if (template.frequency === 'yearly') {
    const anchor = template.anchor_month ?? 1;
    if (today.m !== anchor) return null;
    const periodStart = toISODate(today.y, today.m, 1);
    return isAlreadyGenerated(template.last_generated_period, periodStart) ? null : periodStart;
  }

  return null;
}

function addDays(iso: string, days: number): string {
  const { y, m, d } = parseISODate(iso);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return toISODate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret) {
    console.error('[generate-recurring-expenses] CRON_SECRET not configured');
    return new Response(
      JSON.stringify({ error: 'Function not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (cronSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const todayISO = new Date().toISOString().split('T')[0];
    console.log(`[generate-recurring-expenses] Running for ${todayISO}`);

    const { data: templates, error: templatesError } = await supabase
      .from('expense_recurring_templates')
      .select('*')
      .eq('is_active', true)
      .lte('starts_on', todayISO);

    if (templatesError) throw templatesError;

    let created = 0;
    let skipped = 0;
    const errors: Array<{ templateId: string; message: string }> = [];

    for (const template of (templates ?? []) as RecurringTemplate[]) {
      try {
        if (template.ends_on && template.ends_on < todayISO) {
          skipped++;
          continue;
        }

        const periodStart = computeRecurringExpensePeriod(template, todayISO);
        if (!periodStart) {
          skipped++;
          continue;
        }

        const { data: existing } = await supabase
          .from('expenses')
          .select('id')
          .eq('recurring_template_id', template.id)
          .eq('generated_period_start', periodStart)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const { error: insertError } = await supabase
          .from('expenses')
          .insert({
            center_id: template.center_id,
            kind: 'fixed_recurring',
            category_id: template.category_id,
            supplier_id: template.supplier_id,
            recurring_template_id: template.id,
            generated_period_start: periodStart,
            description: template.description,
            amount: template.default_amount,
            expense_date: periodStart,
            due_date: addDays(periodStart, DEFAULT_DUE_DAYS),
            status: 'pending',
            payment_method: template.default_payment_method,
            vat_rate: template.vat_rate,
            irpf_rate: template.irpf_rate,
            created_by: null,
          });

        if (insertError) {
          // Unique constraint violation means another run already created it — treat as skip, not error.
          if (insertError.code === '23505') {
            skipped++;
            continue;
          }
          throw insertError;
        }

        await supabase
          .from('expense_recurring_templates')
          .update({ last_generated_period: periodStart })
          .eq('id', template.id);

        created++;
      } catch (templateError) {
        const message = templateError instanceof Error ? templateError.message : 'Unknown error';
        console.error(`[generate-recurring-expenses] Error processing template ${template.id}:`, message);
        errors.push({ templateId: template.id, message });
      }
    }

    console.log(`[generate-recurring-expenses] created=${created} skipped=${skipped} errors=${errors.length}`);

    return new Response(
      JSON.stringify({ success: true, created, skipped, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-recurring-expenses] Fatal error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
