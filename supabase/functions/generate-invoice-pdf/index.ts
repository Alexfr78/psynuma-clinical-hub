import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
  retention_rate: number | null;
  retention_amount: number | null;
  total: number;
  notes: string | null;
  verifactu_qr: string | null;
  verifactu_hash: string | null;
  verifactu_timestamp: string | null;
  verifactu_registration_id: string | null;
  is_recapitulative: boolean | null;
  rectified_invoice_id: string | null;
  rectification_type: string | null;
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
    invoice_logo_url: string | null;
    invoice_footer: string | null;
  };
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number | null;
  tax_amount: number | null;
  retention_rate: number | null;
  retention_amount: number | null;
  total: number;
}

// Fetch any image URL and convert to base64 data URL
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    console.log('Fetching image from:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Failed to fetch image:', response.status);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    const base64 = base64Encode(arrayBuffer);
    
    console.log('Image converted to base64, length:', base64.length);
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Error fetching image:', error);
    return null;
  }
}

// Generate QR code as base64 data URL
async function generateQRCodeBase64(url: string, size: number = 120): Promise<string> {
  try {
    const encodedUrl = encodeURIComponent(url);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedUrl}&format=png`;
    
    const result = await fetchImageAsBase64(qrUrl);
    return result || qrUrl; // Fallback to external URL if fetch fails
  } catch (error) {
    console.error('Error generating QR base64:', error);
    const encodedUrl = encodeURIComponent(url);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedUrl}&format=png`;
  }
}

serve(async (req) => {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch invoice data
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        patients (first_name, last_name, tax_id, address, city, postal_code, email),
        centers (name, tax_id, address, city, postal_code, phone, email, invoice_logo_url, invoice_footer)
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

    // Fetch invoice items with tax/retention details
    const { data: items, error: itemsError } = await supabase
      .from("invoice_items")
      .select("description, quantity, unit_price, tax_rate, tax_amount, retention_rate, retention_amount, total")
      .eq("invoice_id", invoice_id);

    if (itemsError) {
      console.error("Items fetch error:", itemsError);
    }

    // Fetch rectified invoice if exists
    let rectifiedInvoice = null;
    if (invoice.rectified_invoice_id) {
      const { data: rectified } = await supabase
        .from("invoices")
        .select("invoice_number, issue_date")
        .eq("id", invoice.rectified_invoice_id)
        .single();
      rectifiedInvoice = rectified;
    }

    const invoiceData = invoice as InvoiceData;
    const invoiceItems = (items || []) as InvoiceItem[];

    // Generate QR as base64 if verifactu is configured
    let qrBase64 = '';
    if (invoiceData.verifactu_qr) {
      console.log('Generating QR base64 for verifactu_qr:', invoiceData.verifactu_qr);
      qrBase64 = await generateQRCodeBase64(invoiceData.verifactu_qr, 100);
    }

    // Generate logo as base64 if configured
    let logoBase64 = '';
    if (invoiceData.centers?.invoice_logo_url) {
      console.log('Fetching logo from:', invoiceData.centers.invoice_logo_url);
      logoBase64 = await fetchImageAsBase64(invoiceData.centers.invoice_logo_url) || '';
    }

    // Generate HTML for PDF
    const html = generateInvoiceHTML(invoiceData, invoiceItems, rectifiedInvoice, qrBase64, logoBase64);

    return new Response(
      JSON.stringify({
        html,
        invoice: {
          number: invoiceData.invoice_number,
          date: invoiceData.issue_date,
          total: invoiceData.total,
          patient: `${invoiceData.patients.first_name} ${invoiceData.patients.last_name}`,
          has_verifactu: !!invoiceData.verifactu_hash
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

function generateInvoiceHTML(invoice: InvoiceData, items: InvoiceItem[], rectifiedInvoice: any, qrBase64: string, logoBase64: string): string {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  // Determine invoice type label
  let invoiceTypeLabel = 'FACTURA';
  if (invoice.is_recapitulative) {
    invoiceTypeLabel = 'FACTURA RECAPITULATIVA';
  } else if (invoice.rectified_invoice_id) {
    invoiceTypeLabel = invoice.rectification_type === 'substitution' 
      ? 'FACTURA RECTIFICATIVA (Sustitución)' 
      : 'FACTURA RECTIFICATIVA (Por diferencias)';
  }

  // Generate QR section if verifactu is configured and QR base64 is available
  const qrSection = invoice.verifactu_qr && qrBase64 ? `
    <div class="qr-section">
      <div class="qr-container">
        <img src="${qrBase64}" alt="QR Verifactu" class="qr-image" />
        <div class="qr-info">
          <p class="qr-title">Verificación AEAT</p>
          <p class="qr-text">Escanea este código QR para verificar la autenticidad de esta factura en la Agencia Tributaria</p>
          ${invoice.verifactu_registration_id ? `<p class="qr-csv">CSV: ${invoice.verifactu_registration_id}</p>` : ''}
        </div>
      </div>
      <div class="verifactu-badge">
        <span>✓ Factura VeriFactu</span>
      </div>
    </div>
  ` : '';

  // Generate rectified invoice reference
  const rectifiedSection = rectifiedInvoice ? `
    <div class="rectified-info">
      <p><strong>Factura rectificada:</strong> ${rectifiedInvoice.invoice_number} del ${formatDate(rectifiedInvoice.issue_date)}</p>
    </div>
  ` : '';

  // Calculate totals from items
  const totalTax = items.reduce((sum, item) => sum + (Number(item.tax_amount) || 0), 0);
  const totalRetention = items.reduce((sum, item) => sum + (Number(item.retention_amount) || 0), 0);

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura ${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #333; padding: 30px; }
    .invoice { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2563eb; }
    .company-info h1 { font-size: 20px; color: #2563eb; margin-bottom: 6px; }
    .company-info p { font-size: 11px; color: #666; margin-bottom: 2px; }
    .invoice-info { text-align: right; }
    .invoice-info h2 { font-size: 22px; color: #2563eb; margin-bottom: 6px; }
    .invoice-info .invoice-type { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .invoice-info p { font-size: 11px; color: #666; margin-bottom: 2px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .party { width: 45%; }
    .party h3 { font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 6px; letter-spacing: 1px; }
    .party p { margin-bottom: 3px; font-size: 11px; }
    .rectified-info { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px; margin-bottom: 20px; border-radius: 4px; }
    .rectified-info p { font-size: 11px; color: #92400e; }
    .items { margin-bottom: 30px; }
    .items table { width: 100%; border-collapse: collapse; }
    .items th { background: #f8fafc; padding: 10px 8px; text-align: left; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 2px solid #e2e8f0; }
    .items td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
    .items .amount { text-align: right; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 30px; }
    .totals-table { width: 280px; }
    .totals-table tr td { padding: 6px 0; font-size: 11px; }
    .totals-table tr td:last-child { text-align: right; }
    .totals-table .subtotal { border-top: 1px solid #e2e8f0; padding-top: 10px; }
    .totals-table .total { font-size: 14px; font-weight: bold; color: #2563eb; border-top: 2px solid #2563eb; padding-top: 10px; }
    .notes { margin-bottom: 30px; padding: 12px; background: #f8fafc; border-radius: 6px; }
    .notes p { font-size: 11px; color: #666; }
    .qr-section { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    .qr-container { display: flex; align-items: flex-start; gap: 15px; }
    .qr-image { width: 100px; height: 100px; border: 1px solid #e2e8f0; }
    .qr-info { flex: 1; }
    .qr-title { font-weight: bold; font-size: 12px; color: #2563eb; margin-bottom: 4px; }
    .qr-text { font-size: 10px; color: #666; margin-bottom: 4px; }
    .qr-csv { font-size: 9px; color: #999; font-family: monospace; }
    .verifactu-badge { margin-top: 10px; }
    .verifactu-badge span { display: inline-block; background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 12px; font-size: 10px; font-weight: 500; }
    .footer { text-align: center; font-size: 10px; color: #999; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px; }
    .footer .custom-footer { margin-bottom: 10px; color: #666; }
    @media print { body { padding: 15px; } }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="company-info">
        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-height: 60px; margin-bottom: 8px;" />` : ''}
        <h1>${invoice.centers?.name || 'Centro'}</h1>
        ${invoice.centers?.tax_id ? `<p>NIF: ${invoice.centers.tax_id}</p>` : ''}
        ${invoice.centers?.address ? `<p>${invoice.centers.address}</p>` : ''}
        ${invoice.centers?.city || invoice.centers?.postal_code ? `<p>${invoice.centers.postal_code || ''} ${invoice.centers.city || ''}</p>` : ''}
        ${invoice.centers?.phone ? `<p>Tel: ${invoice.centers.phone}</p>` : ''}
        ${invoice.centers?.email ? `<p>${invoice.centers.email}</p>` : ''}
      </div>
      <div class="invoice-info">
        <p class="invoice-type">${invoiceTypeLabel}</p>
        <h2>${invoice.invoice_number}</h2>
        <p><strong>Fecha:</strong> ${formatDate(invoice.issue_date)}</p>
        ${invoice.due_date ? `<p><strong>Vencimiento:</strong> ${formatDate(invoice.due_date)}</p>` : ''}
      </div>
    </div>

    ${rectifiedSection}

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
            <th style="width: 40%">Descripción</th>
            <th class="amount">Cantidad</th>
            <th class="amount">Precio Unit.</th>
            <th class="amount">IVA</th>
            <th class="amount">Ret.</th>
            <th class="amount">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
          <tr>
            <td>${item.description}</td>
            <td class="amount">${item.quantity}</td>
            <td class="amount">${formatCurrency(item.unit_price)}</td>
            <td class="amount">${item.tax_rate ? `${item.tax_rate}%` : '-'}</td>
            <td class="amount">${item.retention_rate ? `${item.retention_rate}%` : '-'}</td>
            <td class="amount">${formatCurrency(item.total)}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <table class="totals-table">
        <tr class="subtotal">
          <td>Base imponible:</td>
          <td>${formatCurrency(invoice.subtotal)}</td>
        </tr>
        ${totalTax > 0 ? `
        <tr>
          <td>IVA:</td>
          <td>${formatCurrency(totalTax)}</td>
        </tr>
        ` : ''}
        ${totalRetention > 0 ? `
        <tr>
          <td>Retención IRPF:</td>
          <td>-${formatCurrency(totalRetention)}</td>
        </tr>
        ` : ''}
        <tr class="total">
          <td>TOTAL:</td>
          <td>${formatCurrency(invoice.total)}</td>
        </tr>
      </table>
    </div>

    ${invoice.notes ? `
    <div class="notes">
      <p><strong>Notas:</strong> ${invoice.notes}</p>
    </div>
    ` : ''}

    ${qrSection}

    <div class="footer">
      ${invoice.centers?.invoice_footer ? `<p class="custom-footer">${invoice.centers.invoice_footer}</p>` : ''}
      <p>Factura generada por Psycma · Sistema de Gestión Clínica</p>
      ${invoice.verifactu_hash ? `<p style="font-size: 8px; color: #999; margin-top: 5px;">Hash: ${invoice.verifactu_hash.substring(0, 32)}...</p>` : ''}
    </div>
  </div>
</body>
</html>
  `;
}