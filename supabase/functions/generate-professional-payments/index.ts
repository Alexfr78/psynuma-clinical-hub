import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_DUE_DAYS = 5;

interface CompensationAgreement {
  id: string;
  center_id: string;
  professional_id: string;
  compensation_type: 'fixed' | 'percentage' | 'mixed';
  fixed_amount: number;
  percentage_rate: number;
  compensation_basis: 'collected_payments' | 'issued_invoices';
  default_irpf_rate: number | null;
  category_id: string | null;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
}

function lastDayOfPreviousMonth(reference: Date): { periodStart: string; periodEnd: string } {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth(); // 0-based; previous month relative to `reference`
  const periodStartDate = new Date(Date.UTC(year, month - 1, 1));
  const periodEndDate = new Date(Date.UTC(year, month, 0)); // day 0 of current month = last day of previous month
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { periodStart: fmt(periodStartDate), periodEnd: fmt(periodEndDate) };
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((p) => parseInt(p, 10));
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
}

const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret) {
    console.error('[generate-professional-payments] CRON_SECRET not configured');
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

    const { periodStart, periodEnd } = lastDayOfPreviousMonth(new Date());
    console.log(`[generate-professional-payments] Settling period ${periodStart} to ${periodEnd}`);

    const { data: agreements, error: agreementsError } = await supabase
      .from('professional_compensation_agreements')
      .select('*')
      .eq('is_active', true)
      .is('effective_to', null)
      .lte('effective_from', periodEnd);

    if (agreementsError) throw agreementsError;

    let created = 0;
    let skipped = 0;
    let totalAmount = 0;
    const errors: Array<{ agreementId: string; message: string }> = [];

    for (const agreement of (agreements ?? []) as CompensationAgreement[]) {
      try {
        const { data: existing } = await supabase
          .from('expenses')
          .select('id, status')
          .eq('compensation_agreement_id', agreement.id)
          .eq('compensation_period_start', periodStart)
          .maybeSingle();

        // Idempotency: if a pending settlement already exists for this period,
        // leave it as-is (the admin may already be reviewing it) rather than
        // creating a duplicate. If it was already paid, we also skip — an
        // adjustment for late-arriving payments must be a new manual line,
        // never a silent edit of an already-paid expense.
        if (existing) {
          skipped++;
          continue;
        }

        const amountFixed = agreement.compensation_type === 'fixed' || agreement.compensation_type === 'mixed'
          ? Number(agreement.fixed_amount) || 0
          : 0;

        let amountVariable = 0;
        if (agreement.compensation_type === 'percentage' || agreement.compensation_type === 'mixed') {
          const { data: calc, error: calcError } = await supabase.rpc(
            '_calculate_professional_variable_amount_internal',
            {
              p_professional_id: agreement.professional_id,
              p_center_id: agreement.center_id,
              p_period_start: periodStart,
              p_period_end: periodEnd,
              p_percentage_rate: agreement.percentage_rate,
              p_basis: agreement.compensation_basis,
            },
          );
          if (calcError) throw calcError;
          amountVariable = Number(calc?.[0]?.variable_amount) || 0;
        }

        const totalForProfessional = amountFixed + amountVariable;
        if (totalForProfessional <= 0) {
          skipped++;
          continue;
        }

        let categoryId = agreement.category_id;
        if (!categoryId) {
          const { data: defaultCategory } = await supabase
            .from('expense_categories')
            .select('id')
            .eq('center_id', agreement.center_id)
            .eq('is_professional_payment_category', true)
            .limit(1)
            .maybeSingle();
          categoryId = defaultCategory?.id ?? null;
        }
        if (!categoryId) {
          throw new Error('No se encontró una categoría de "Pagos a profesionales" para el centro');
        }

        const { data: professional } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', agreement.professional_id)
          .maybeSingle();
        const professionalName = [professional?.first_name, professional?.last_name].filter(Boolean).join(' ') || 'profesional';

        const periodDate = new Date(`${periodStart}T00:00:00Z`);
        const monthLabel = `${MONTH_NAMES_ES[periodDate.getUTCMonth()]} ${periodDate.getUTCFullYear()}`;

        // IRPF, only if the agreement configures a default rate.
        let irpfRate: number | null = null;
        let irpfAmount: number | null = null;
        if (agreement.default_irpf_rate != null) {
          irpfRate = Number(agreement.default_irpf_rate);
          irpfAmount = Math.round(totalForProfessional * irpfRate) / 100;
        }

        const { error: insertError } = await supabase
          .from('expenses')
          .insert({
            center_id: agreement.center_id,
            kind: 'professional_payment',
            category_id: categoryId,
            professional_id: agreement.professional_id,
            compensation_agreement_id: agreement.id,
            compensation_period_start: periodStart,
            compensation_period_end: periodEnd,
            description: `Liquidación ${monthLabel} — ${professionalName}`,
            amount: totalForProfessional,
            irpf_rate: irpfRate,
            irpf_amount: irpfAmount,
            expense_date: periodEnd,
            due_date: addDays(periodEnd, DEFAULT_DUE_DAYS),
            status: 'pending',
            created_by: null,
          });

        if (insertError) {
          if (insertError.code === '23505') {
            skipped++;
            continue;
          }
          throw insertError;
        }

        created++;
        totalAmount += totalForProfessional;
      } catch (agreementError) {
        const message = agreementError instanceof Error ? agreementError.message : 'Unknown error';
        console.error(`[generate-professional-payments] Error processing agreement ${agreement.id}:`, message);
        errors.push({ agreementId: agreement.id, message });
      }
    }

    console.log(`[generate-professional-payments] created=${created} skipped=${skipped} totalAmount=${totalAmount} errors=${errors.length}`);

    return new Response(
      JSON.stringify({ success: true, created, skipped, totalAmount, errors, periodStart, periodEnd }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-professional-payments] Fatal error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
