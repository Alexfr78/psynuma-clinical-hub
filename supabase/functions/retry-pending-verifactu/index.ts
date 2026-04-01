import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = 5;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret) {
    console.error('[retry-pending-verifactu] CRON_SECRET not configured');
    return new Response(
      JSON.stringify({ error: 'Function not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (cronSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[retry-pending-verifactu] Starting retry process...");

    // Get all pending invoices (exclude permanent errors)
    // CRITICAL: Order by issue_date ASC, invoice_number ASC to preserve chronological sequence
    const { data: pendingInvoices, error: fetchError } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        issue_date,
        center_id,
        verifactu_retry_count,
        verifactu_error_permanent
      `)
      .eq("verifactu_pending", true)
      .neq("verifactu_error_permanent", true)
      .lt("verifactu_retry_count", MAX_RETRIES)
      .order("issue_date", { ascending: true })
      .order("invoice_number", { ascending: true });

    if (fetchError) {
      console.error("[retry-pending-verifactu] Error fetching pending invoices:", fetchError);
      throw fetchError;
    }

    if (!pendingInvoices || pendingInvoices.length === 0) {
      console.log("[retry-pending-verifactu] No pending invoices to retry");
      return new Response(
        JSON.stringify({ message: "No pending invoices", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[retry-pending-verifactu] Found ${pendingInvoices.length} pending invoices`);

    // Group invoices by center_id to process each center's chain sequentially
    const invoicesByCenter = new Map<string, typeof pendingInvoices>();
    for (const invoice of pendingInvoices) {
      const existing = invoicesByCenter.get(invoice.center_id) || [];
      existing.push(invoice);
      invoicesByCenter.set(invoice.center_id, existing);
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    // Process each center's invoices in strict chronological order
    // CRITICAL: Stop processing a center on first failure to prevent chain gaps
    for (const [centerId, centerInvoices] of invoicesByCenter) {
      console.log(`[retry-pending-verifactu] Processing center ${centerId}: ${centerInvoices.length} pending invoices`);
      
      for (const invoice of centerInvoices) {
        console.log(`[retry-pending-verifactu] Processing invoice ${invoice.invoice_number} (${invoice.issue_date}) (retry ${(invoice.verifactu_retry_count || 0) + 1}/${MAX_RETRIES})`);

        try {
          // Call sign-invoice-verifactu function
          const signResponse = await fetch(`${supabaseUrl}/functions/v1/sign-invoice-verifactu`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ invoice_id: invoice.id }),
          });

          const signResult = await signResponse.json();

          if (signResponse.ok && !signResult.error) {
            // Success
            console.log(`[retry-pending-verifactu] Invoice ${invoice.invoice_number} registered successfully`);
            
            await supabase
              .from("invoices")
              .update({ verifactu_pending: false })
              .eq("id", invoice.id);

            results.push({ id: invoice.id, success: true });
          } else {
            // Failed - increment retry count
            const newRetryCount = (invoice.verifactu_retry_count || 0) + 1;
            const maxRetriesReached = newRetryCount >= MAX_RETRIES;
            
            console.log(`[retry-pending-verifactu] Invoice ${invoice.invoice_number} failed: ${signResult.error || 'Unknown error'}`);
            
            await supabase
              .from("invoices")
              .update({
                verifactu_retry_count: newRetryCount,
                verifactu_pending: !maxRetriesReached,
              })
              .eq("id", invoice.id);

            // Log the failure
            await supabase.from("verifactu_events").insert({
              center_id: invoice.center_id,
              invoice_id: invoice.id,
              event_type: "retry_failed",
              error_details: signResult.error || "Unknown error",
              retry_count: newRetryCount,
            });

            results.push({ 
              id: invoice.id, 
              success: false, 
              error: maxRetriesReached 
                ? `Max retries (${MAX_RETRIES}) reached` 
                : signResult.error 
            });

            // CRITICAL: Stop processing this center on failure to preserve chain order
            console.log(`[retry-pending-verifactu] STOPPING center ${centerId} - must resolve ${invoice.invoice_number} before processing subsequent invoices`);
            break;
          }
        } catch (invoiceError) {
          console.error(`[retry-pending-verifactu] Error processing invoice ${invoice.id}:`, invoiceError);
          
          const newRetryCount = (invoice.verifactu_retry_count || 0) + 1;
          
          await supabase
            .from("invoices")
            .update({
              verifactu_retry_count: newRetryCount,
              verifactu_pending: newRetryCount < MAX_RETRIES,
            })
            .eq("id", invoice.id);

          results.push({ 
            id: invoice.id, 
            success: false, 
            error: invoiceError instanceof Error ? invoiceError.message : "Unknown error" 
          });

          // CRITICAL: Stop processing this center on error
          console.log(`[retry-pending-verifactu] STOPPING center ${centerId} due to error`);
          break;
        }

        // Small delay between invoices to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[retry-pending-verifactu] Completed. Success: ${successCount}, Failed: ${failCount}`);

    return new Response(
      JSON.stringify({
        message: "Retry process completed",
        processed: results.length,
        success: successCount,
        failed: failCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[retry-pending-verifactu] Error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
