import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceData {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  patients: {
    first_name: string;
    last_name: string;
    tax_id: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    email: string | null;
  };
  centers: {
    name: string;
    tax_id: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    phone: string | null;
    email: string | null;
  };
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
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
        patients (first_name, last_name, tax_id, address, city, postal_code, email),
        centers (name, tax_id, address, city, postal_code, phone, email)
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

    // Fetch invoice items
    const { data: items, error: itemsError } = await supabase
      .from("invoice_items")
      .select("description, quantity, unit_price, total")
      .eq("invoice_id", invoice_id);

    if (itemsError) {
      console.error("Items fetch error:", itemsError);
    }

    const invoiceData = invoice as InvoiceData;
    const invoiceItems = (items || []) as InvoiceItem[];

    // Generate HTML for PDF
    const html = generateInvoiceHTML(invoiceData, invoiceItems);

    // Return HTML that can be converted to PDF client-side
    // or used with a PDF generation service
    return new Response(
      JSON.stringify({
        html,
        invoice: {
          number: invoiceData.invoice_number,
          date: invoiceData.issue_date,
          total: invoiceData.total,
          patient: `${invoiceData.patients.first_name} ${invoiceData.patients.last_name}`,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating PDF:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateInvoiceHTML(invoice: InvoiceData, items: InvoiceItem[]): string {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura ${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #333; padding: 40px; }
    .invoice { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #2563eb; }
    .company-info h1 { font-size: 24px; color: #2563eb; margin-bottom: 8px; }
    .company-info p { font-size: 12px; color: #666; }
    .invoice-info { text-align: right; }
    .invoice-info h2 { font-size: 28px; color: #2563eb; margin-bottom: 8px; }
    .invoice-info p { font-size: 12px; color: #666; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .party { width: 45%; }
    .party h3 { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 1px; }
    .party p { margin-bottom: 4px; }
    .items { margin-bottom: 40px; }
    .items table { width: 100%; border-collapse: collapse; }
    .items th { background: #f8fafc; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid #e2e8f0; }
    .items td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
    .items .amount { text-align: right; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 40px; }
    .totals-table { width: 300px; }
    .totals-table tr td { padding: 8px 0; }
    .totals-table tr td:last-child { text-align: right; }
    .totals-table .total { font-size: 18px; font-weight: bold; color: #2563eb; border-top: 2px solid #2563eb; padding-top: 12px; }
    .footer { text-align: center; font-size: 11px; color: #999; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="company-info">
        <h1>${invoice.centers?.name || 'Centro'}</h1>
        ${invoice.centers?.tax_id ? `<p>NIF: ${invoice.centers.tax_id}</p>` : ''}
        ${invoice.centers?.address ? `<p>${invoice.centers.address}</p>` : ''}
        ${invoice.centers?.city || invoice.centers?.postal_code ? `<p>${invoice.centers.postal_code || ''} ${invoice.centers.city || ''}</p>` : ''}
        ${invoice.centers?.phone ? `<p>Tel: ${invoice.centers.phone}</p>` : ''}
        ${invoice.centers?.email ? `<p>${invoice.centers.email}</p>` : ''}
      </div>
      <div class="invoice-info">
        <h2>FACTURA</h2>
        <p><strong>Nº:</strong> ${invoice.invoice_number}</p>
        <p><strong>Fecha:</strong> ${formatDate(invoice.issue_date)}</p>
        ${invoice.due_date ? `<p><strong>Vencimiento:</strong> ${formatDate(invoice.due_date)}</p>` : ''}
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>Facturar a</h3>
        <p><strong>${invoice.patients.first_name} ${invoice.patients.last_name}</strong></p>
        ${invoice.patients.tax_id ? `<p>NIF: ${invoice.patients.tax_id}</p>` : ''}
        ${invoice.patients.address ? `<p>${invoice.patients.address}</p>` : ''}
        ${invoice.patients.city || invoice.patients.postal_code ? `<p>${invoice.patients.postal_code || ''} ${invoice.patients.city || ''}</p>` : ''}
        ${invoice.patients.email ? `<p>${invoice.patients.email}</p>` : ''}
      </div>
    </div>

    <div class="items">
      <table>
        <thead>
          <tr>
            <th>Descripción</th>
            <th class="amount">Cantidad</th>
            <th class="amount">Precio Unit.</th>
            <th class="amount">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
          <tr>
            <td>${item.description}</td>
            <td class="amount">${item.quantity}</td>
            <td class="amount">${formatCurrency(item.unit_price)}</td>
            <td class="amount">${formatCurrency(item.total)}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <table class="totals-table">
        <tr>
          <td>Base imponible:</td>
          <td>${formatCurrency(invoice.subtotal)}</td>
        </tr>
        <tr>
          <td>IVA (${invoice.tax_rate}%):</td>
          <td>${formatCurrency(invoice.tax_amount)}</td>
        </tr>
        <tr class="total">
          <td>TOTAL:</td>
          <td>${formatCurrency(invoice.total)}</td>
        </tr>
      </table>
    </div>

    ${invoice.notes ? `
    <div style="margin-bottom: 40px; padding: 16px; background: #f8fafc; border-radius: 8px;">
      <p style="font-size: 12px; color: #666;"><strong>Notas:</strong> ${invoice.notes}</p>
    </div>
    ` : ''}

    <div class="footer">
      <p>Factura generada por Psynuma · Sistema de Gestión Clínica</p>
    </div>
  </div>
</body>
</html>
  `;
}
