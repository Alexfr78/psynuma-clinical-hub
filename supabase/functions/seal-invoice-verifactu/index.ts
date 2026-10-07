import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Retirada: calculaba una huella que no es la reglamentaria y emitía facturas
// sin comprobar el centro del llamante. Emitir un borrador va por useIssueInvoice
// y el registro en la AEAT por sign-invoice-verifactu. Se deja este stub para que
// la versión desplegada deje de modificar facturas.
serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({ error: "Función retirada. Usa sign-invoice-verifactu." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
