import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceSeries {
  id: string;
  name: string;
  invoice_type: 'simplified' | 'complete' | null;
  series_type: 'ordinary' | 'rectifying' | null;
}

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
  series_id: string | null;
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
    invoice_data_protection_text: string | null;
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

/**
 * Unified invoice document type label logic
 * Must match the frontend implementation in src/lib/invoiceDocumentType.ts
 */
function getInvoiceDocumentTypeLabel(
  invoice: { is_recapitulative?: boolean | null; rectified_invoice_id?: string | null; rectification_type?: string | null },
  series: InvoiceSeries | null
): string {
  const isSimplified = series?.invoice_type === 'simplified';
  const isRectifying = !!invoice.rectified_invoice_id || series?.series_type === 'rectifying';
  const isSubstitution = invoice.rectification_type === 'substitution';
  const isRecapitulativa = !!invoice.is_recapitulative;

  if (isRectifying) {
    const rectTypeLabel = isSubstitution ? '(Sustitutiva)' : '(Por diferencias)';
    if (isSimplified) {
      return `FACTURA RECTIFICATIVA SIMPLIFICADA ${rectTypeLabel}`;
    }
    return `FACTURA RECTIFICATIVA ${rectTypeLabel}`;
  }
  
  if (isRecapitulativa) {
    if (isSimplified) {
      return 'FACTURA RECAPITULATIVA SIMPLIFICADA';
    }
    return 'FACTURA RECAPITULATIVA';
  }
  
  if (isSimplified) {
    return 'FACTURA SIMPLIFICADA';
  }
  
  return 'FACTURA';
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

    // Fetch invoice data with series join
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        patients (first_name, last_name, tax_id, address, city, postal_code, email),
        centers (name, tax_id, address, city, postal_code, phone, email, invoice_logo_url, invoice_footer, invoice_data_protection_text)
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

    // Fetch series data if series_id exists
    let series: InvoiceSeries | null = null;
    if (invoice.series_id) {
      const { data: seriesData } = await supabase
        .from("invoice_series")
        .select("id, name, invoice_type, series_type")
        .eq("id", invoice.series_id)
        .single();
      
      if (seriesData) {
        series = seriesData as InvoiceSeries;
      }
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

    // Generate HTML for PDF with unified label logic
    const html = generateInvoiceHTML(invoiceData, invoiceItems, rectifiedInvoice, qrBase64, logoBase64, series);

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

function generateInvoiceHTML(
  invoice: InvoiceData, 
  items: InvoiceItem[], 
  rectifiedInvoice: any, 
  qrBase64: string, 
  logoBase64: string,
  series: InvoiceSeries | null
): string {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const invoiceTypeLabel = getInvoiceDocumentTypeLabel(invoice, series);

  // Build badge HTML for document type flags
  const isSimplified = series?.invoice_type === 'simplified';
  const isRectifying = !!invoice.rectified_invoice_id || series?.series_type === 'rectifying';
  const isSubstitution = invoice.rectification_type === 'substitution';
  const isRecapitulativa = !!invoice.is_recapitulative;

  let flagBadges = '';
  if (isSimplified) flagBadges += '<span class="badge">Simplificada</span>';
  if (isRectifying) flagBadges += `<span class="badge">${isSubstitution ? 'Sustitutiva' : 'Por diferencias'}</span>`;
  if (isRecapitulativa) flagBadges += '<span class="badge">Recapitulativa</span>';

  const rectifiedSection = rectifiedInvoice ? `
    <div class="rectified-info">
      <p><strong>Factura rectificada:</strong> ${rectifiedInvoice.invoice_number} del ${formatDate(rectifiedInvoice.issue_date)}</p>
    </div>
  ` : '';

  const totalTax = items.reduce((sum, item) => sum + (Number(item.tax_amount) || 0), 0);
  const totalRetention = items.reduce((sum, item) => sum + (Number(item.retention_amount) || 0), 0);
  const avgTaxRate = items.length > 0 ? items.find(i => (i.tax_rate || 0) > 0)?.tax_rate || 0 : 0;
  const avgRetentionRate = items.length > 0 ? items.find(i => (i.retention_rate || 0) > 0)?.retention_rate || 0 : 0;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura ${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #0f172a;
      background: #f8fafc;
      padding: 32px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1);
      border: 1px solid #e2e8f0;
      padding: 40px;
    }
    .space-y-8 > * + * { margin-top: 32px; }

    /* Header */
    .header { display: flex; justify-content: space-between; gap: 24px; }
    .header-left { flex: 1; }
    .header-left img { max-height: 64px; object-fit: contain; margin-bottom: 16px; }
    .header-left h2 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .header-left .meta { font-size: 13px; color: #64748b; }
    .header-left .meta p { margin-bottom: 2px; }
    .header-right { text-align: right; flex-shrink: 0; }
    .header-right h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .header-right .inv-number { font-size: 20px; font-weight: 600; color: #2563eb; margin-bottom: 8px; }
    .header-right .dates { font-size: 13px; color: #64748b; }
    .header-right .dates p { margin-bottom: 4px; }
    .header-right .dates span.label { font-weight: 500; }

    /* Badges */
    .badges { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; margin-top: 8px; }
    .badge {
      display: inline-block;
      font-size: 11px;
      padding: 2px 8px;
      border: 1px solid #e2e8f0;
      border-radius: 9999px;
      color: #475569;
      background: #fff;
    }

    /* Client info */
    .client-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      background: rgba(248,250,252,0.5);
    }
    .client-box h3 { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
    .client-box .info { font-size: 13px; }
    .client-box .info p { margin-bottom: 2px; }
    .client-box .info .name { font-weight: 500; }

    /* Rectified info */
    .rectified-info {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      color: #92400e;
    }

    /* Items table */
    .items-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .items-table th {
      text-align: left;
      padding: 12px 8px;
      border-bottom: 1px solid #e2e8f0;
      font-weight: 500;
      color: #0f172a;
    }
    .items-table th.right, .items-table td.right { text-align: right; }
    .items-table td {
      padding: 12px 8px;
      border-bottom: 1px solid #e2e8f0;
    }
    .items-table td.right.bold { font-weight: 500; }

    /* Totals */
    .totals-wrapper { display: flex; justify-content: flex-end; }
    .totals { width: 256px; }
    .totals .row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
    .totals .row.muted { color: #64748b; }
    .totals .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 18px;
      font-weight: 700;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      margin-top: 4px;
    }
    .totals .total-row .amount { color: #2563eb; }

    /* Notes */
    .notes { border-top: 1px solid #e2e8f0; padding-top: 16px; }
    .notes h4 { font-size: 14px; font-weight: 500; margin-bottom: 8px; }
    .notes p { font-size: 13px; color: #64748b; white-space: pre-wrap; }

    /* QR section */
    .qr-section { border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; align-items: center; gap: 16px; }
    .qr-section img { width: 96px; height: 96px; }
    .qr-section .qr-text { font-size: 12px; color: #64748b; }
    .qr-section .qr-text p.title { font-weight: 500; color: #475569; margin-bottom: 2px; }

    /* Footer */
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      white-space: pre-wrap;
    }

    /* Data Protection */
    .data-protection {
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      font-size: 9px;
      line-height: 1.5;
      color: #94a3b8;
      white-space: pre-wrap;
    }

    @media print {
      body { background: #fff; padding: 16px; }
      .card { box-shadow: none; border: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="space-y-8">

        <!-- Header -->
        <div class="header">
          <div class="header-left">
            ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" />` : ''}
            <h2>${invoice.centers?.name || 'Centro'}</h2>
            <div class="meta">
              ${invoice.centers?.tax_id ? `<p>NIF: ${invoice.centers.tax_id}</p>` : ''}
              ${invoice.centers?.address ? `<p>${invoice.centers.address}</p>` : ''}
              ${invoice.centers?.city || invoice.centers?.postal_code ? `<p>${[invoice.centers.postal_code, invoice.centers.city].filter(Boolean).join(' ')}</p>` : ''}
              ${invoice.centers?.phone ? `<p>Tel: ${invoice.centers.phone}</p>` : ''}
              ${invoice.centers?.email ? `<p>${invoice.centers.email}</p>` : ''}
            </div>
          </div>
          <div class="header-right">
            <h1>${invoiceTypeLabel}</h1>
            <p class="inv-number">${invoice.invoice_number}</p>
            <div class="dates">
              <p><span class="label">Fecha emisión:</span> ${formatDate(invoice.issue_date)}</p>
              ${invoice.due_date ? `<p><span class="label">Fecha vencimiento:</span> ${formatDate(invoice.due_date)}</p>` : ''}
            </div>
            ${flagBadges ? `<div class="badges">${flagBadges}</div>` : ''}
          </div>
        </div>

        ${rectifiedSection}

        <!-- Client info -->
        <div class="client-box">
          <h3>Datos del cliente</h3>
          <div class="info">
            <p class="name">${invoice.patients.first_name} ${invoice.patients.last_name}</p>
            ${invoice.patients.tax_id ? `<p>NIF/CIF: ${invoice.patients.tax_id}</p>` : ''}
            ${invoice.patients.address ? `<p>${invoice.patients.address}</p>` : ''}
            ${invoice.patients.city || invoice.patients.postal_code ? `<p>${[invoice.patients.postal_code, invoice.patients.city].filter(Boolean).join(' ')}</p>` : ''}
            ${invoice.patients.email ? `<p>${invoice.patients.email}</p>` : ''}
          </div>
        </div>

        <!-- Items table -->
        <div>
          <table class="items-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th class="right" style="width:64px">Cant.</th>
                <th class="right" style="width:96px">Precio</th>
                <th class="right" style="width:64px">IVA</th>
                <th class="right" style="width:64px">IRPF</th>
                <th class="right" style="width:96px">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
              <tr>
                <td>${item.description}</td>
                <td class="right">${item.quantity}</td>
                <td class="right">${formatCurrency(item.unit_price)}</td>
                <td class="right">${item.tax_rate ? `${item.tax_rate}%` : '-'}</td>
                <td class="right">${item.retention_rate ? `-${item.retention_rate}%` : '-'}</td>
                <td class="right bold">${formatCurrency(item.total)}</td>
              </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Totals -->
        <div class="totals-wrapper">
          <div class="totals">
            <div class="row">
              <span>Base imponible:</span>
              <span>${formatCurrency(invoice.subtotal)}</span>
            </div>
            ${totalTax > 0 ? `
            <div class="row">
              <span>IVA${avgTaxRate ? ` (${avgTaxRate}%)` : ''}:</span>
              <span>${formatCurrency(totalTax)}</span>
            </div>
            ` : ''}
            ${totalRetention > 0 ? `
            <div class="row muted">
              <span>Retención IRPF${avgRetentionRate ? ` (${avgRetentionRate}%)` : ''}:</span>
              <span>-${formatCurrency(totalRetention)}</span>
            </div>
            ` : ''}
            <div class="total-row">
              <span>Total:</span>
              <span class="amount">${formatCurrency(invoice.total)}</span>
            </div>
          </div>
        </div>

        ${invoice.notes ? `
        <!-- Notes -->
        <div class="notes">
          <h4>Observaciones</h4>
          <p>${invoice.notes}</p>
        </div>
        ` : ''}

        ${invoice.verifactu_qr && qrBase64 ? `
        <!-- QR Verifactu -->
        <div class="qr-section">
          <img src="${qrBase64}" alt="Código QR Verifactu" />
          <div class="qr-text">
            <p class="title">Factura registrada en Verifactu</p>
            <p>Puede verificar la autenticidad de esta factura escaneando el código QR</p>
          </div>
        </div>
        ` : ''}

        ${invoice.centers?.invoice_footer ? `
        <!-- Footer -->
        <div class="footer">${invoice.centers.invoice_footer}</div>
        ` : ''}

        ${invoice.centers?.invoice_data_protection_text ? `
        <!-- Data Protection -->
        <div class="data-protection">${invoice.centers.invoice_data_protection_text}</div>
        ` : ''}

      </div>
    </div>
  </div>
</body>
</html>
  `;
}
