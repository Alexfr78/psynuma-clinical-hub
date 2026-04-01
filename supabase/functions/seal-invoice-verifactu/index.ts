import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple hash function for demonstration
// In production, this would use proper cryptographic signatures
async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoice_id } = await req.json();

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: "invoice_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch invoice data
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        patients (first_name, last_name, tax_id),
        centers (name, tax_id)
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice fetch error:", invoiceError);
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // IDEMPOTENT: If already sealed, return success with existing hash
    if (invoice.verifactu_hash) {
      console.log(`Invoice ${invoice.invoice_number} already sealed, returning existing hash`);
      return new Response(
        JSON.stringify({ 
          success: true,
          already_sealed: true,
          invoice_number: invoice.invoice_number,
          hash: invoice.verifactu_hash,
          timestamp: invoice.verifactu_timestamp,
          message: "Invoice was already sealed"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate hash from invoice data
    // This follows Verifactu requirements for data to include in the hash
    const sealData = {
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      emitter_tax_id: invoice.centers?.tax_id || '',
      emitter_name: invoice.centers?.name || '',
      receiver_tax_id: invoice.patients?.tax_id || '',
      receiver_name: `${invoice.patients?.first_name} ${invoice.patients?.last_name}`,
      subtotal: invoice.subtotal,
      tax_rate: invoice.tax_rate,
      tax_amount: invoice.tax_amount,
      total: invoice.total,
    };

    const dataString = JSON.stringify(sealData);
    const hash = await generateHash(dataString);
    const timestamp = new Date().toISOString();

    // Update invoice with Verifactu data
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        verifactu_hash: hash,
        verifactu_timestamp: timestamp,
        status: 'issued', // Auto-issue when sealed
      })
      .eq("id", invoice_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update invoice" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Invoice ${invoice.invoice_number} sealed with hash: ${hash}`);

    return new Response(
      JSON.stringify({
        success: true,
        invoice_number: invoice.invoice_number,
        hash,
        timestamp,
        message: "Invoice sealed and issued successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error sealing invoice:", error);
    console.error("[seal-invoice-verifactu] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
