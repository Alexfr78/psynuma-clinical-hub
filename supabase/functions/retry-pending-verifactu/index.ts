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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[retry-pending-verifactu] Starting retry process...");

    // Get all pending invoices (exclude permanent errors)
    const { data: pendingInvoices, error: fetchError } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        center_id,
        verifactu_retry_count,
        verifactu_error_permanent
      `)
      .eq("verifactu_pending", true)
      .neq("verifactu_error_permanent", true)
      .lt("verifactu_retry_count", MAX_RETRIES)
      .order("created_at", { ascending: true });

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

    const results: { id: string; success: boolean; error?: string }[] = [];

    // Process each invoice
    for (const invoice of pendingInvoices) {
      console.log(`[retry-pending-verifactu] Processing invoice ${invoice.invoice_number} (retry ${(invoice.verifactu_retry_count || 0) + 1}/${MAX_RETRIES})`);

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
          // Success - mark as not pending
          console.log(`[retry-pending-verifactu] Invoice ${invoice.invoice_number} registered successfully`);
          
          await supabase
            .from("invoices")
            .update({
              verifactu_pending: false,
            })
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
              // Keep pending unless max retries reached
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
      }

      // Small delay between invoices to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
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
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
