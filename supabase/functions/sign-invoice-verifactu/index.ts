import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Dynamic import of node-forge with bundle for Deno compatibility
const forgeModule = await import("https://esm.sh/node-forge@1.3.1?bundle");
const forge = forgeModule.default || forgeModule;

// Patch for Deno compatibility - forge.random.getBytes
forge.random.getBytes = (count: number) => {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return String.fromCharCode.apply(null, Array.from(bytes));
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AEAT Verifactu endpoints - Updated URLs (Jan 2025)
const AEAT_ENDPOINTS = {
  test: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  production: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
};

// SOAPAction for Alta (invoice registration) - WSDL specifies empty action
const SOAP_ACTION_ALTA = "";

// ============= AES-256-GCM Decryption =============
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function decryptAES256GCM(encryptedBase64: string, keyHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const combined = base64ToBytes(encryptedBase64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv, tagLength: 128 },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

function isEncrypted(data: string): boolean {
  try {
    const decoded = base64ToBytes(data);
    if (decoded.length > 4) {
      const byte0 = decoded[0];
      const byte1 = decoded[1];
      if (byte0 === 0x30 && (byte1 === 0x82 || byte1 === 0x83 || byte1 < 0x80)) {
        console.log('Data appears to be unencrypted PFX (starts with 0x30)');
        return false;
      }
    }
    console.log('Data appears to be encrypted (does not start with 0x30)');
    return true;
  } catch (e) {
    console.log('Error checking encryption status, assuming encrypted:', e);
    return true;
  }
}

async function decryptCertificateData(
  certificateBase64: string, 
  certificatePassword: string
): Promise<{ certificate: string; password: string }> {
  const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
  
  if (!encryptionKey) {
    console.log('No encryption key configured, using raw certificate data');
    return { certificate: certificateBase64, password: certificatePassword };
  }
  
  console.log('Decrypting certificate data...');
  try {
    const certificate = await decryptAES256GCM(certificateBase64, encryptionKey);
    const password = await decryptAES256GCM(certificatePassword, encryptionKey);
    console.log('Certificate data decrypted successfully');
    return { certificate, password };
  } catch (decryptError) {
    console.log('Decryption failed, trying raw data (legacy):', decryptError);
    return { certificate: certificateBase64, password: certificatePassword };
  }
}
// ============= End Decryption =============

// Generate SHA-256 hash
async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Format date for Verifactu (DD-MM-YYYY)
function formatDateVerifactu(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

// Format timestamp for Verifactu - ISO 8601 with timezone offset (AEAT requirement)
function formatTimestampVerifactu(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  
  // Calculate timezone offset in minutes
  const tzOffset = -date.getTimezoneOffset();
  const sign = tzOffset >= 0 ? '+' : '-';
  const offsetHours = pad(Math.floor(Math.abs(tzOffset) / 60));
  const offsetMinutes = pad(Math.abs(tzOffset) % 60);
  
  // Return ISO 8601 format: YYYY-MM-DDTHH:mm:ss+HH:MM
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
}

// Generate Verifactu QR URL
function generateQRUrl(nifEmisor: string, numSerie: string, fechaExpedicion: string, importe: number, environment: string): string {
  const baseUrl = environment === 'production' 
    ? "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR"
    : "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR";
  const params = new URLSearchParams({
    nif: nifEmisor,
    numserie: numSerie,
    fecha: fechaExpedicion,
    importe: importe.toFixed(2)
  });
  return `${baseUrl}?${params.toString()}`;
}

// Escape XML special characters
function escapeXML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Sanitize NumSerieFactura field - must be A-Z, 0-9, hyphen only, no spaces/invisible chars
// Error 1100 occurs when this field has invalid characters
function sanitizeNumSerieFactura(input: unknown): string {
  // Log raw input for debugging
  console.log("RAW NumSerieFactura input:", JSON.stringify(input), "type:", typeof input);
  
  if (input == null || input === '') {
    throw new Error('NumSerieFactura no puede estar vacío (valor original nulo o vacío)');
  }
  
  let s = String(input)
    .replace(/[\u00A0\r\n\t]/g, ' ')  // Replace NBSP and control chars with space
    .trim()
    .toUpperCase();
  
  // Normalize Unicode hyphens to ASCII hyphen (en-dash, em-dash, minus sign, etc.)
  s = s.replace(/[\u2010-\u2015\u2212\u2013\u2014]/g, '-');
  
  // Remove all whitespace
  s = s.replace(/\s+/g, '');
  
  // Remove any character that's not A-Z, 0-9, or hyphen
  s = s.replace(/[^A-Z0-9\-]/g, '');
  
  console.log("NORMALIZED NumSerieFactura:", JSON.stringify(s));
  
  // Validate format
  if (s.length === 0) {
    throw new Error(`NumSerieFactura vacío después de normalizar (valor original: ${JSON.stringify(input)})`);
  }
  
  if (!/^[A-Z0-9\-]{1,60}$/.test(s)) {
    throw new Error(`NumSerieFactura inválido: "${s}" (longitud: ${s.length})`);
  }
  
  return s;
}

// Sanitize NombreSistemaInformatico field (TextMax30Type)
// Must be non-empty string, max 30 chars, no control characters
function sanitizeNombreSistemaInformatico(input: unknown): string {
  let s = (input ?? "").toString();

  // Clean line breaks, tabs
  s = s.replace(/[\r\n\t]+/g, " ").trim();

  // Remove control characters (ASCII 0-31 and 127)
  s = s.replace(/[\x00-\x1F\x7F]/g, "");

  // Remove emoji/surrogates
  s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");

  // Collapse multiple spaces
  s = s.replace(/\s{2,}/g, " ");

  // Must not be empty
  if (!s) s = "PSYCMA";

  // Max 30 characters (TextMax30Type)
  if (s.length > 30) s = s.slice(0, 30).trim();

  return s;
}

// Determine invoice type based on series invoice_type and other factors
function determineInvoiceType(invoice: any): string {
  // Check if it's a simplified invoice based on series type
  const isSimplified = invoice.series?.invoice_type === 'simplified';
  
  // Rectifying invoices
  if (invoice.rectified_invoice_id) {
    if (invoice.rectification_reason_code) {
      return invoice.rectification_reason_code; // R1, R2, R3, R4, or R5
    }
    // Legacy fallback
    if (invoice.rectification_type === 'S') {
      return 'R1'; // Rectificativa por sustitución
    }
    return isSimplified ? 'R5' : 'R1';
  }
  
  // Recapitulative invoices (factura que agrupa simplificadas)
  if (invoice.is_recapitulative) {
    return 'F3';
  }
  
  // Simplified invoice (from series type)
  if (isSimplified) {
    return 'F2';
  }
  
  // Default: Complete invoice
  return 'F1';
}

// Check if invoice type requires Destinatarios block
// F1, F3, R1, R2, R3, R4 require Destinatarios
// F2, R5 must NOT have Destinatarios
function requiresDestinatarios(tipoFactura: string): boolean {
  return ['F1', 'F3', 'R1', 'R2', 'R3', 'R4'].includes(tipoFactura);
}

// Build Desglose XML from invoice items
// Groups items by fiscal treatment (S1/EXENTA/NO_SUJETA/S2) and tax rate
function buildDesgloseFromItems(invoiceItems: any[], invoice: any): string {
  // If no items, fallback to invoice-level data
  if (!invoiceItems || invoiceItems.length === 0) {
    const totalBase = Number(invoice.subtotal) || 0;
    const totalIVA = Number(invoice.tax_amount) || 0;
    
    if (totalIVA === 0) {
      // EXENTA: use OperacionExenta (NOT CalificacionOperacion) for E1-E8 codes per XSD schema
      return `
          <sum1:DetalleDesglose>
            <sum1:Impuesto>01</sum1:Impuesto>
            <sum1:ClaveRegimen>01</sum1:ClaveRegimen>
            <sum1:OperacionExenta>E1</sum1:OperacionExenta>
            <sum1:BaseImponibleOimporteNoSujeto>${totalBase.toFixed(2)}</sum1:BaseImponibleOimporteNoSujeto>
            <sum1:CuotaRepercutida>0.00</sum1:CuotaRepercutida>
          </sum1:DetalleDesglose>`;
    } else {
      const taxRate = Number(invoice.tax_rate) || 21;
      return `
          <sum1:DetalleDesglose>
            <sum1:Impuesto>01</sum1:Impuesto>
            <sum1:ClaveRegimen>01</sum1:ClaveRegimen>
            <sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion>
            <sum1:TipoImpositivo>${taxRate.toFixed(2)}</sum1:TipoImpositivo>
            <sum1:BaseImponibleOimporteNoSujeto>${totalBase.toFixed(2)}</sum1:BaseImponibleOimporteNoSujeto>
            <sum1:CuotaRepercutida>${Number(invoice.tax_amount).toFixed(2)}</sum1:CuotaRepercutida>
          </sum1:DetalleDesglose>`;
    }
  }

  // Group items by treatment type and tax rate
  interface DesgloseGroup {
    treatment: string;
    taxRate: number;
    exemptionCode: string | null;
    nonSubjectCode: string | null;
    baseImponible: number;
    cuotaRepercutida: number;
  }

  const groups: Map<string, DesgloseGroup> = new Map();

  for (const item of invoiceItems) {
    const taxRate = Number(item.tax_rate) || 0;
    const base = Number(item.unit_price) * Number(item.quantity || 1);
    const cuota = Number(item.tax_amount) || 0;
    
    // Determine treatment from item or infer from tax rate
    let treatment = item.tax_treatment || (taxRate === 0 ? 'EXENTA' : 'S1');
    let exemptionCode = item.exemption_code || (treatment === 'EXENTA' ? 'E1' : null);
    let nonSubjectCode = item.non_subject_code || null;

    // Create group key based on treatment + tax rate
    const groupKey = `${treatment}-${taxRate}-${exemptionCode || ''}-${nonSubjectCode || ''}`;

    if (groups.has(groupKey)) {
      const existing = groups.get(groupKey)!;
      existing.baseImponible += base;
      existing.cuotaRepercutida += cuota;
    } else {
      groups.set(groupKey, {
        treatment,
        taxRate,
        exemptionCode,
        nonSubjectCode,
        baseImponible: base,
        cuotaRepercutida: cuota,
      });
    }
  }

  // Build XML for each group
  let xml = '';
  for (const group of groups.values()) {
    xml += '\n          <sum1:DetalleDesglose>';
    xml += '\n            <sum1:Impuesto>01</sum1:Impuesto>';
    xml += '\n            <sum1:ClaveRegimen>01</sum1:ClaveRegimen>';

    if (group.treatment === 'EXENTA') {
      // EXENTA: use OperacionExenta (NOT CalificacionOperacion) for E1-E8 codes per XSD schema
      xml += `\n            <sum1:OperacionExenta>${group.exemptionCode || 'E1'}</sum1:OperacionExenta>`;
      xml += `\n            <sum1:BaseImponibleOimporteNoSujeto>${group.baseImponible.toFixed(2)}</sum1:BaseImponibleOimporteNoSujeto>`;
      xml += '\n            <sum1:CuotaRepercutida>0.00</sum1:CuotaRepercutida>';
    } else if (group.treatment === 'NO_SUJETA') {
      // Non-subject operation - use CalificacionOperacion with N1/N2 code
      xml += `\n            <sum1:CalificacionOperacion>${group.nonSubjectCode || 'N1'}</sum1:CalificacionOperacion>`;
      xml += `\n            <sum1:BaseImponibleOimporteNoSujeto>${group.baseImponible.toFixed(2)}</sum1:BaseImponibleOimporteNoSujeto>`;
      xml += '\n            <sum1:CuotaRepercutida>0.00</sum1:CuotaRepercutida>';
    } else if (group.treatment === 'S2') {
      // Reverse charge - S2 with no CuotaRepercutida
      xml += '\n            <sum1:CalificacionOperacion>S2</sum1:CalificacionOperacion>';
      xml += `\n            <sum1:TipoImpositivo>0.00</sum1:TipoImpositivo>`;
      xml += `\n            <sum1:BaseImponibleOimporteNoSujeto>${group.baseImponible.toFixed(2)}</sum1:BaseImponibleOimporteNoSujeto>`;
      xml += '\n            <sum1:CuotaRepercutida>0.00</sum1:CuotaRepercutida>';
    } else {
      // S1 - Subject with VAT
      xml += '\n            <sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion>';
      xml += `\n            <sum1:TipoImpositivo>${group.taxRate.toFixed(2)}</sum1:TipoImpositivo>`;
      xml += `\n            <sum1:BaseImponibleOimporteNoSujeto>${group.baseImponible.toFixed(2)}</sum1:BaseImponibleOimporteNoSujeto>`;
      xml += `\n            <sum1:CuotaRepercutida>${group.cuotaRepercutida.toFixed(2)}</sum1:CuotaRepercutida>`;
    }

    xml += '\n          </sum1:DetalleDesglose>';
  }

  return xml;
}

// Calculate hash for chaining (Huella) - AEAT format: campo=valor&campo=valor...
async function calculateInvoiceHash(invoice: any, center: any, previousHash: string | null, timestamp: string): Promise<string> {
  const nifEmisor = (center.tax_id?.replace(/[^A-Z0-9]/gi, '') || '').trim();
  // Sanitize NumSerieFactura to prevent error 1100
  const numSerie = sanitizeNumSerieFactura(invoice.invoice_number);
  console.log("NumSerieFactura raw:", JSON.stringify(invoice.invoice_number));
  console.log("NumSerieFactura sanitized:", JSON.stringify(numSerie));
  const fechaExpedicion = formatDateVerifactu(invoice.issue_date);
  
  // Determine invoice type using the unified function
  const tipoFactura = determineInvoiceType(invoice);
  
  const cuotaTotal = (Number(invoice.tax_amount) || 0).toFixed(2);
  const importeTotal = Number(invoice.total).toFixed(2);
  // For first invoice, Huella should be empty (not the hash itself)
  const huellaAnterior = (previousHash || '').trim();
  
  // AEAT format: campo=valor&campo=valor (8 fields in exact order)
  const dataToHash = [
    `IDEmisorFactura=${nifEmisor}`,
    `NumSerieFactura=${numSerie}`,
    `FechaExpedicionFactura=${fechaExpedicion}`,
    `TipoFactura=${tipoFactura}`,
    `CuotaTotal=${cuotaTotal}`,
    `ImporteTotal=${importeTotal}`,
    `Huella=${huellaAnterior}`,
    `FechaHoraHusoGenRegistro=${timestamp}`
  ].join('&');
  
  console.log("Hash input data (AEAT format):", dataToHash);
  console.log("Invoice type for hash:", tipoFactura, "(series invoice_type:", invoice.series?.invoice_type || 'N/A', ")");
  return await generateSHA256(dataToHash);
}

// Build RegistroAlta XML for invoice registration with correct namespaces
// sum: for container elements (RegFactuSistemaFacturacion, Cabecera, RegistroFactura)
// sum1: for internal types (IDVersion, ObligadoEmision, RegistroAlta, etc.)
function buildRegistroAltaXML(
  invoice: any, 
  center: any, 
  patient: any, 
  invoiceItems: any[], 
  previousHash: string | null, 
  generationTimestamp: string, 
  invoiceHash: string,
  rectifiedInvoice: { id: string; invoice_number: string; issue_date: string } | null
): string {
  const nifEmisor = center.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';
  const nombreEmisor = center.name || '';
  const fechaExpedicion = formatDateVerifactu(invoice.issue_date);
  // Sanitize NumSerieFactura to prevent error 1100
  const numSerieFactura = sanitizeNumSerieFactura(invoice.invoice_number);
  
  const patientTaxId = patient?.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';
  const patientName = patient ? `${patient.first_name} ${patient.last_name}`.trim() : 'Cliente';
  
  // Build DescripcionOperacion - ALWAYS required, never empty
  // Use triple fallback: item description -> rectification message -> generic invoice message
  let descripcionOperacion: string;
  
  // Try to get description from first invoice item
  const firstItemDescription = (invoiceItems && invoiceItems.length > 0 && invoiceItems[0]?.description) 
    ? String(invoiceItems[0].description).replace(/[\r\n\t]+/g, ' ').trim() 
    : '';
  
  if (firstItemDescription.length > 0) {
    descripcionOperacion = firstItemDescription;
  } else if (invoice.rectified_invoice_id && rectifiedInvoice?.invoice_number) {
    // For rectifying invoices without items, use rectification message
    descripcionOperacion = `Rectificación de factura ${rectifiedInvoice.invoice_number}`;
  } else if (invoice.notes && invoice.notes.trim().length > 0) {
    // Try invoice notes as fallback
    descripcionOperacion = invoice.notes.trim();
  } else {
    // Ultimate fallback - always valid
    descripcionOperacion = `Factura ${invoice.invoice_number}`;
  }
  
  // Final safety: ensure never empty (should never reach here, but just in case)
  if (!descripcionOperacion || descripcionOperacion.trim().length === 0) {
    descripcionOperacion = `Factura ${numSerieFactura}`;
  }
  
  // Truncate to max 250 chars, escape XML special characters
  descripcionOperacion = escapeXML(descripcionOperacion.substring(0, 250));
  console.log("DescripcionOperacion final value:", descripcionOperacion);
  
  // Build desglose (breakdown) from invoice items
  // Group items by fiscal treatment to create proper DetalleDesglose entries
  const desgloseXML = buildDesgloseFromItems(invoiceItems, invoice);
  
  // CRITICAL: Validate desglose is never empty - AEAT error 4102 occurs when Desglose is missing
  if (!desgloseXML || desgloseXML.trim().length === 0) {
    console.error("ERROR: buildDesgloseFromItems returned empty XML");
    throw new Error("Error interno: No se pudo generar el desglose fiscal. Verifique que la factura tiene líneas con datos fiscales.");
  }
  console.log("Desglose XML generated, length:", desgloseXML.length);
  console.log("Desglose XML preview:", desgloseXML.substring(0, 500));

  // Build encadenamiento (chaining)
  let encadenamientoXML = '';
  if (previousHash) {
    encadenamientoXML = `
            <sum1:RegistroAnterior>
              <sum1:IDEmisorFactura>${nifEmisor}</sum1:IDEmisorFactura>
              <sum1:NumSerieFactura>${numSerieFactura}</sum1:NumSerieFactura>
              <sum1:FechaExpedicionFactura>${fechaExpedicion}</sum1:FechaExpedicionFactura>
              <sum1:Huella>${previousHash}</sum1:Huella>
            </sum1:RegistroAnterior>`;
  } else {
    encadenamientoXML = `<sum1:PrimerRegistro>S</sum1:PrimerRegistro>`;
  }

  // Software info
  // NombreRazon del fabricante: debe coincidir con censo AEAT
  const softwareNombreRazon = center.verifactu_software_name || nombreEmisor;
  // NombreSistemaInformatico: nombre comercial del producto, max 30 chars, sin caracteres especiales
  const softwareSistemaInfo = sanitizeNombreSistemaInformatico(center.verifactu_sistema_informatico || 'PSYCMA');
  const softwareVersion = center.verifactu_software_version || '1.0.0';
  const softwareNif = (center.verifactu_software_nif || nifEmisor).replace(/[^A-Z0-9]/gi, '');

  // Determine invoice type using the unified function
  const tipoFactura = determineInvoiceType(invoice);
  console.log(`Invoice type determined: ${tipoFactura} (series invoice_type: ${invoice.series?.invoice_type || 'N/A'})`);

  // Build rectified invoice reference if applicable
  let facturasRectificadasXML = '';
  if (invoice.rectified_invoice_id && rectifiedInvoice) {
    // Pre-validate rectified invoice data
    if (!rectifiedInvoice.invoice_number) {
      throw new Error(`No se pudo obtener el número de la factura rectificada (ID: ${invoice.rectified_invoice_id}). Verifique que la factura original existe.`);
    }
    // Sanitize rectified invoice number as well
    const rectifiedNumSerie = sanitizeNumSerieFactura(rectifiedInvoice.invoice_number);
    facturasRectificadasXML = `
          <sum1:FacturasRectificadas>
            <sum1:IDFacturaRectificada>
              <sum1:IDEmisorFactura>${nifEmisor}</sum1:IDEmisorFactura>
              <sum1:NumSerieFactura>${rectifiedNumSerie}</sum1:NumSerieFactura>
              <sum1:FechaExpedicionFactura>${formatDateVerifactu(rectifiedInvoice.issue_date)}</sum1:FechaExpedicionFactura>
            </sum1:IDFacturaRectificada>
          </sum1:FacturasRectificadas>`;
  }

  // Build TipoRectificativa for rectifying invoices
  // XSD ORDER: TipoRectificativa comes AFTER TipoFactura and BEFORE FacturasRectificadas
  let tipoRectificativaXML = '';
  // Build ImporteRectificacion separately - XSD ORDER: comes AFTER FacturasRectificadas/FacturasSustituidas
  let importeRectificacionXML = '';
  
  if (invoice.rectified_invoice_id) {
    // Map database values to AEAT codes: differences -> I, substitution -> S
    // Also handle legacy direct I/S values for backwards compatibility
    const dbType = (invoice.rectification_type || '').toString().trim();
    let tipoRect: string;
    if (dbType === 'differences' || dbType === 'I' || dbType.toUpperCase().startsWith('I')) {
      tipoRect = 'I';
    } else if (dbType === 'substitution' || dbType === 'S' || dbType.toUpperCase().startsWith('S')) {
      tipoRect = 'S';
    } else {
      tipoRect = 'I'; // Default to 'I' (por diferencias)
    }
    console.log(`TipoRectificativa mapped: DB value "${dbType}" -> AEAT code "${tipoRect}"`);
    
    tipoRectificativaXML = `
          <sum1:TipoRectificativa>${tipoRect}</sum1:TipoRectificativa>`;
    
    // For substitution (S) type, include BaseRectificada and CuotaRectificada
    // ImporteRectificacion goes in a SEPARATE variable to maintain XSD order
    if (tipoRect === 'S' && (invoice.base_rectificada !== null || invoice.cuota_rectificada !== null)) {
      const baseRect = Number(invoice.base_rectificada) || 0;
      const cuotaRect = Number(invoice.cuota_rectificada) || 0;
      const cuotaRecargoRect = Number(invoice.cuota_recargo_rectificado) || 0;
      
      importeRectificacionXML = `
          <sum1:ImporteRectificacion>
            <sum1:BaseRectificada>${baseRect.toFixed(2)}</sum1:BaseRectificada>
            <sum1:CuotaRectificada>${cuotaRect.toFixed(2)}</sum1:CuotaRectificada>${cuotaRecargoRect > 0 ? `
            <sum1:CuotaRecargoRectificado>${cuotaRecargoRect.toFixed(2)}</sum1:CuotaRecargoRectificado>` : ''}
          </sum1:ImporteRectificacion>`;
    }
  }

  // Build Destinatarios section based on invoice type
  // F1, F3, R1-R4 REQUIRE Destinatarios; F2, R5 must NOT have Destinatarios
  let destinatariosXML = '';
  const needsDestinatarios = requiresDestinatarios(tipoFactura);
  
  if (needsDestinatarios) {
    if (!patientTaxId) {
      throw new Error(`Las facturas tipo ${tipoFactura} (factura completa) requieren el NIF del paciente. Actualice los datos fiscales del paciente antes de firmar.`);
    }
    destinatariosXML = `
          <sum1:Destinatarios>
            <sum1:IDDestinatario>
              <sum1:NombreRazon>${escapeXML(patientName)}</sum1:NombreRazon>
              <sum1:NIF>${patientTaxId}</sum1:NIF>
            </sum1:IDDestinatario>
          </sum1:Destinatarios>`;
  }
  // For F2 and R5, Destinatarios is omitted (forbidden by AEAT)

  // Build the body content with correct namespace prefixes
  // sum: for container elements (RegFactuSistemaFacturacion, Cabecera, RegistroFactura)
  // sum1: for internal types (ObligadoEmision, RegistroAlta, etc.)
  // Namespaces are declared on the soapenv:Envelope, not here
  return `<sum:RegFactuSistemaFacturacion>
      <sum:Cabecera>
        <sum1:ObligadoEmision>
          <sum1:NombreRazon>${escapeXML(nombreEmisor)}</sum1:NombreRazon>
          <sum1:NIF>${nifEmisor}</sum1:NIF>
        </sum1:ObligadoEmision>
      </sum:Cabecera>
      <sum:RegistroFactura>
        <sum1:RegistroAlta>
          <sum1:IDVersion>1.0</sum1:IDVersion>
          <sum1:IDFactura>
            <sum1:IDEmisorFactura>${nifEmisor}</sum1:IDEmisorFactura>
            <sum1:NumSerieFactura>${numSerieFactura}</sum1:NumSerieFactura>
            <sum1:FechaExpedicionFactura>${fechaExpedicion}</sum1:FechaExpedicionFactura>
          </sum1:IDFactura>
          <sum1:NombreRazonEmisor>${escapeXML(nombreEmisor)}</sum1:NombreRazonEmisor>
          <sum1:TipoFactura>${tipoFactura}</sum1:TipoFactura>
${tipoRectificativaXML}${facturasRectificadasXML}${importeRectificacionXML}          <sum1:DescripcionOperacion>${descripcionOperacion}</sum1:DescripcionOperacion>
${destinatariosXML}          <sum1:Desglose>
${desgloseXML}
          </sum1:Desglose>
          <sum1:CuotaTotal>${Number(invoice.tax_amount || 0).toFixed(2)}</sum1:CuotaTotal>
          <sum1:ImporteTotal>${Number(invoice.total).toFixed(2)}</sum1:ImporteTotal>
          <sum1:Encadenamiento>
            ${encadenamientoXML}
          </sum1:Encadenamiento>
          <sum1:SistemaInformatico>
            <sum1:NombreRazon>${escapeXML(softwareNombreRazon)}</sum1:NombreRazon>
            <sum1:NIF>${softwareNif}</sum1:NIF>
            <sum1:NombreSistemaInformatico>${softwareSistemaInfo}</sum1:NombreSistemaInformatico>
            <sum1:IdSistemaInformatico>01</sum1:IdSistemaInformatico>
            <sum1:Version>${softwareVersion}</sum1:Version>
            <sum1:NumeroInstalacion>1</sum1:NumeroInstalacion>
            <sum1:TipoUsoPosibleSoloVerifactu>S</sum1:TipoUsoPosibleSoloVerifactu>
            <sum1:TipoUsoPosibleMultiOT>N</sum1:TipoUsoPosibleMultiOT>
            <sum1:IndicadorMultiplesOT>N</sum1:IndicadorMultiplesOT>
          </sum1:SistemaInformatico>
          <sum1:FechaHoraHusoGenRegistro>${generationTimestamp}</sum1:FechaHoraHusoGenRegistro>
          <sum1:TipoHuella>01</sum1:TipoHuella>
          <sum1:Huella>${invoiceHash}</sum1:Huella>
        </sum1:RegistroAlta>
      </sum:RegistroFactura>
    </sum:RegFactuSistemaFacturacion>`;
}

// Extract certificates from PKCS12 for XML signing
function extractCertificatesFromPKCS12(certificateBase64: string, certificatePassword: string): {
  privateKey: any;
  certificate: any;
} {
  console.log('Attempting to decode certificate, base64 length:', certificateBase64.length);
  console.log('Certificate password length:', certificatePassword.length);
  
  const p12Der = forge.util.decode64(certificateBase64);
  console.log('Decoded DER length:', p12Der.length);
  
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  console.log('Parsed ASN1 successfully');
  
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certificatePassword);

  let privateKey: any = null;
  let endEntityCert: any = null;
  const allCertificates: any[] = [];

  // Extract all certificates and private key
  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && safeBag.key) {
        privateKey = safeBag.key;
      } else if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
        allCertificates.push(safeBag.cert);
      }
    }
  }

  console.log(`Found ${allCertificates.length} certificates in PKCS12`);

  if (!privateKey || allCertificates.length === 0) {
    throw new Error("No se pudo extraer la clave privada o el certificado");
  }

  // Find the end-entity certificate (the one that matches the private key)
  for (const cert of allCertificates) {
    try {
      const certPublicKey = forge.pki.publicKeyToPem(cert.publicKey);
      const derivedPublicKey = forge.pki.publicKeyToPem(forge.pki.rsa.setPublicKey(
        privateKey.n,
        privateKey.e
      ));
      if (certPublicKey === derivedPublicKey) {
        endEntityCert = cert;
        console.log('Found end-entity certificate matching private key');
        break;
      }
    } catch (e) {
      // If comparison fails, continue checking
    }
  }

  // If no match found, use the first certificate
  if (!endEntityCert) {
    endEntityCert = allCertificates[0];
    console.log('Using first certificate as end-entity');
  }

  console.log('Extracted certificate and private key for signing');

  return { privateKey, certificate: endEntityCert };
}

// Build complete signed SOAP envelope with namespaces declared on Envelope
function buildSignedSOAPEnvelope(body: string, privateKey: any, certificate: any): string {
  // Namespace URLs per AEAT XSD
  const NS_SUM = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
  const NS_SUM1 = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

  // Create the full body with namespaces for signing
  const fullBody = `<soapenv:Body xmlns:sum="${NS_SUM}" xmlns:sum1="${NS_SUM1}">${body}</soapenv:Body>`;

  // Sign the body
  const signature = signXMLBody(fullBody, privateKey, certificate);

  // Build complete SOAP envelope with all namespaces on Envelope element
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="${NS_SUM}" xmlns:sum1="${NS_SUM1}">
  <soapenv:Header>
    ${signature}
  </soapenv:Header>
  <soapenv:Body>
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`;
}

// Sign XML body and return signature element
function signXMLBody(body: string, privateKey: any, certificate: any): string {
  try {
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
    const certBase64 = forge.util.encode64(certDer);

    // Canonicalize body for digest
    const canonicalBody = body.replace(/>\s+</g, '><').trim();
    
    // Calculate body digest
    const bodyMd = forge.md.sha256.create();
    bodyMd.update(canonicalBody, 'utf8');
    const bodyDigest = forge.util.encode64(bodyMd.digest().bytes());

    // Build SignedInfo
    const signedInfo = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
<ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
<ds:Reference URI="">
<ds:Transforms>
<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
<ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
</ds:Transforms>
<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
<ds:DigestValue>${bodyDigest}</ds:DigestValue>
</ds:Reference>
</ds:SignedInfo>`;

    // Canonicalize SignedInfo for signing
    const canonicalSignedInfo = signedInfo.replace(/>\s+</g, '><').trim();

    // Create signature using RSA-SHA256
    const md = forge.md.sha256.create();
    md.update(canonicalSignedInfo, 'utf8');
    const signature = privateKey.sign(md);
    const signatureValue = forge.util.encode64(signature);

    console.log("XML signed successfully");

    return `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
${signedInfo}
<ds:SignatureValue>${signatureValue}</ds:SignatureValue>
<ds:KeyInfo>
<ds:X509Data>
<ds:X509Certificate>${certBase64}</ds:X509Certificate>
</ds:X509Data>
</ds:KeyInfo>
</ds:Signature>`;
  } catch (error) {
    console.error("Error signing XML:", error);
    throw new Error(`Error al firmar el XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Extract CSV from AEAT response
function extractCSV(responseXml: string): string | null {
  const csvMatch = responseXml.match(/<[^>]*CSV[^>]*>([^<]+)<\/[^>]*CSV[^>]*>/i);
  return csvMatch?.[1] || null;
}

// Extract response code from AEAT response
function extractResponseCode(responseXml: string): string | null {
  const codeMatch = responseXml.match(/<[^>]*CodigoErrorRegistro[^>]*>([^<]+)<\/[^>]*CodigoErrorRegistro[^>]*>/i);
  return codeMatch?.[1] || null;
}

// Send XML to AEAT with mTLS authentication
async function sendToAEAT(
  signedXml: string, 
  environment: string,
  privateKey: any,
  certificate: any
): Promise<{ success: boolean; response?: string; error?: string; httpStatus?: number }> {
  const endpoint = environment === 'production' ? AEAT_ENDPOINTS.production : AEAT_ENDPOINTS.test;
  
  try {
    console.log("Sending to AEAT endpoint:", endpoint);
    console.log("Using SOAPAction:", SOAP_ACTION_ALTA);
    
    // Convert certificate and private key to PEM format for mTLS
    const certPem = forge.pki.certificateToPem(certificate);
    const keyPem = forge.pki.privateKeyToPem(privateKey);
    
    console.log("Creating HTTP client with mTLS authentication...");
    
    // Create HTTP client with mTLS (mutual TLS) - AEAT requires client certificate authentication
    const client = Deno.createHttpClient({
      cert: certPem,
      key: keyPem,
    });
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': SOAP_ACTION_ALTA
      },
      body: signedXml,
      // @ts-ignore - Deno specific option for mTLS
      client: client
    });

    const responseText = await response.text();
    console.log("AEAT Response status:", response.status);
    console.log("AEAT Response (first 2000 chars):", responseText.substring(0, 2000));

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${responseText}`, httpStatus: response.status };
    }

    // Detect HTML error page
    if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html')) {
      const titleMatch = responseText.match(/<title>[^<]*?(\d{3})[^<]*?<\/title>/i);
      const errorCode = titleMatch?.[1] || 'HTML';
      console.error(`AEAT returned HTML error page with code ${errorCode}`);
      return { 
        success: false, 
        error: `AEAT devolvió página de error ${errorCode}`, 
        response: responseText, 
        httpStatus: response.status 
      };
    }

    // Check for EstadoEnvio/EstadoRegistro = Incorrecto (multiple namespace patterns: sifac, tikR)
    const estadoEnvioMatch = responseText.match(/<(?:sifac|tikR):EstadoEnvio>([^<]+)<\/(?:sifac|tikR):EstadoEnvio>/);
    const estadoRegistroMatch = responseText.match(/<(?:sifac|tikR):EstadoRegistro>([^<]+)<\/(?:sifac|tikR):EstadoRegistro>/);
    const estadoEnvio = estadoEnvioMatch?.[1];
    const estadoRegistro = estadoRegistroMatch?.[1];
    
    // Extract error code and description (support multiple namespaces)
    const errorCodePatterns = [
      /<(?:sifac|tikR):CodigoErrorRegistro>(\d+)<\/(?:sifac|tikR):CodigoErrorRegistro>/,
      /<CodigoErrorRegistro>(\d+)<\/CodigoErrorRegistro>/
    ];
    const errorDescPatterns = [
      /<(?:sifac|tikR):DescripcionErrorRegistro>([^<]+)<\/(?:sifac|tikR):DescripcionErrorRegistro>/,
      /<DescripcionErrorRegistro>([^<]+)<\/DescripcionErrorRegistro>/
    ];
    
    let errorCode: string | null = null;
    let errorDesc: string | null = null;
    
    for (const pattern of errorCodePatterns) {
      const match = responseText.match(pattern);
      if (match) { errorCode = match[1]; break; }
    }
    for (const pattern of errorDescPatterns) {
      const match = responseText.match(pattern);
      if (match) { errorDesc = match[1]; break; }
    }
    
    // Check for SOAP faults
    const faultMatch = responseText.match(/<faultstring>([^<]+)<\/faultstring>/);
    
    // If there's an error code or status is Incorrecto, return error with details
    if (errorCode || estadoEnvio === 'Incorrecto' || estadoRegistro === 'Incorrecto' || faultMatch) {
      const errorMessage = errorDesc || faultMatch?.[1] || 'Registro rechazado por AEAT';
      console.log(`AEAT rejected invoice: Code ${errorCode || 'N/A'}, Message: ${errorMessage}`);
      return { 
        success: false, 
        error: errorCode ? `Error ${errorCode}: ${errorMessage}` : errorMessage, 
        response: responseText, 
        httpStatus: response.status 
      };
    }

    // Check for successful response (CSV in response indicates success)
    const csv = extractCSV(responseText);
    if (csv) {
      console.log("AEAT returned CSV:", csv);
      return { success: true, response: responseText, httpStatus: response.status };
    }

    // Check for EstadoRegistro = Correcto or EstadoEnvio = Correcto
    if (estadoEnvio === 'Correcto' || estadoRegistro === 'Correcto' || 
        responseText.includes('Correcto') || responseText.includes('Aceptada')) {
      return { success: true, response: responseText, httpStatus: response.status };
    }

    // If we have a valid SOAP response but no clear success/error, log warning and return as pending
    if (responseText.includes('RespuestaRegFactuSistemaFacturacion') || responseText.includes('env:Envelope')) {
      console.log("AEAT response received but status unclear, treating as success");
      return { success: true, response: responseText, httpStatus: response.status };
    }

    // Unknown response format
    console.log("Unknown AEAT response format");
    return { 
      success: false, 
      error: 'Respuesta inesperada de AEAT - formato no reconocido', 
      response: responseText, 
      httpStatus: response.status 
    };
  } catch (error) {
    console.error("Error sending to AEAT:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Error de conexión' };
  }
}

// Log event to verifactu_events table
async function logVerifactuEvent(supabase: any, eventData: {
  invoice_id: string;
  center_id: string;
  event_type: 'alta' | 'anulacion' | 'consulta' | 'error' | 'reintento';
  aeat_csv?: string | null;
  aeat_response_code?: string | null;
  aeat_response_message?: string | null;
  aeat_response_xml?: string | null;
  xml_sent?: string | null;
  environment: string;
  http_status?: number | null;
  error_details?: string | null;
}) {
  try {
    const { error } = await supabase
      .from('verifactu_events')
      .insert(eventData);
    
    if (error) {
      console.error("Error logging verifactu event:", error);
    }
  } catch (err) {
    console.error("Exception logging verifactu event:", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { invoice_id } = await req.json();

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: "invoice_id es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing invoice ${invoice_id} for Verifactu signing`);

    // Fetch invoice with related data including series for invoice_type
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        patients (id, first_name, last_name, tax_id, address, city, postal_code),
        invoice_items (*),
        rectified_invoice:invoices!rectified_invoice_id (id, invoice_number, issue_date),
        series:invoice_series!series_id (id, invoice_type, series_type),
        centers (
          id, name, tax_id,
          verifactu_certificate_base64, verifactu_certificate_password,
          verifactu_environment, verifactu_software_name, 
          verifactu_software_version, verifactu_software_nif
        )
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice fetch error:", invoiceError);
      return new Response(
        JSON.stringify({ error: "Factura no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const center = invoice.centers;
    const patient = invoice.patients;
    const invoiceItems = invoice.invoice_items || [];
    const environment = center?.verifactu_environment || 'test';

    console.log("Invoice data loaded, environment:", environment);

    // Verify certificate configuration
    if (!center?.verifactu_certificate_base64 || !center?.verifactu_certificate_password) {
      await logVerifactuEvent(supabase, {
        invoice_id,
        center_id: invoice.center_id,
        event_type: 'error',
        environment,
        error_details: 'Certificado Verifactu no configurado'
      });
      return new Response(
        JSON.stringify({ error: "Certificado Verifactu no configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify NIF
    if (!center.tax_id) {
      await logVerifactuEvent(supabase, {
        invoice_id,
        center_id: invoice.center_id,
        event_type: 'error',
        environment,
        error_details: 'NIF del centro no configurado'
      });
      return new Response(
        JSON.stringify({ error: "NIF del centro no configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get previous invoice hash for chaining - ONLY from successfully AEAT-accepted invoices
    // This ensures that failed invoices don't break the chain
    const { data: previousInvoice } = await supabase
      .from("invoices")
      .select("verifactu_hash, verifactu_timestamp")
      .eq("center_id", invoice.center_id)
      .not("verifactu_registration_id", "is", null)  // Only AEAT-accepted invoices (have CSV)
      .not("verifactu_hash", "is", null)
      .neq("id", invoice_id)
      .order("verifactu_timestamp", { ascending: false })  // Order by AEAT acceptance time
      .limit(1)
      .maybeSingle();

    const previousHash = previousInvoice?.verifactu_hash || null;
    console.log("Previous invoice hash:", previousHash ? "found" : "none (first invoice or no accepted invoices)");

    // Generate timestamp
    const generationTimestamp = formatTimestampVerifactu(new Date());
    console.log("Generation timestamp:", generationTimestamp);

    // Calculate invoice hash
    const invoiceHash = await calculateInvoiceHash(invoice, center, previousHash, generationTimestamp);
    console.log("Calculated invoice hash:", invoiceHash);

    // Decrypt certificate data if encrypted
    const { certificate: decryptedCert, password: decryptedPassword } = await decryptCertificateData(
      center.verifactu_certificate_base64,
      center.verifactu_certificate_password
    );

    // Extract certificate and private key for signing
    let certData: { privateKey: any; certificate: any };
    try {
      certData = extractCertificatesFromPKCS12(decryptedCert, decryptedPassword);
    } catch (certError) {
      console.error("Certificate extraction error:", certError);
      await logVerifactuEvent(supabase, {
        invoice_id,
        center_id: invoice.center_id,
        event_type: 'error',
        environment,
        error_details: `Error extrayendo certificado: ${certError instanceof Error ? certError.message : 'Error desconocido'}`
      });
      return new Response(
        JSON.stringify({ error: "Error procesando el certificado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure we have rectified invoice data if needed
    let rectifiedInvoice: { id: string; invoice_number: string; issue_date: string } | null = null;
    if (invoice.rectified_invoice_id) {
      // First try the nested relationship data
      rectifiedInvoice = invoice.rectified_invoice as { id: string; invoice_number: string; issue_date: string } | null;
      console.log("Rectified invoice from relationship:", JSON.stringify(rectifiedInvoice));
      
      // If relationship didn't load properly, fetch it explicitly
      if (!rectifiedInvoice || !rectifiedInvoice.invoice_number) {
        console.log("Fetching rectified invoice separately for ID:", invoice.rectified_invoice_id);
        const { data: fetchedRectified, error: rectifiedError } = await supabase
          .from("invoices")
          .select("id, invoice_number, issue_date")
          .eq("id", invoice.rectified_invoice_id)
          .single();
        
        if (rectifiedError) {
          console.error("Error fetching rectified invoice:", rectifiedError);
          throw new Error(`Error cargando factura rectificada: ${rectifiedError.message}`);
        }
        
        if (fetchedRectified) {
          rectifiedInvoice = fetchedRectified;
          console.log("Rectified invoice fetched explicitly:", JSON.stringify(rectifiedInvoice));
        } else {
          throw new Error(`Factura rectificada no encontrada (ID: ${invoice.rectified_invoice_id})`);
        }
      }
    }

    // Build XML body
    const xmlBody = buildRegistroAltaXML(invoice, center, patient, invoiceItems, previousHash, generationTimestamp, invoiceHash, rectifiedInvoice);
    console.log("Built XML body, length:", xmlBody.length);
    
    // CRITICAL VERIFICATION: Ensure Desglose block is present and contains DetalleDesglose
    const hasDesglose = /<sum1:Desglose>/.test(xmlBody);
    const desgloseBlock = xmlBody.match(/<sum1:Desglose>[\s\S]*?<\/sum1:Desglose>/)?.[0];
    console.log("Has <sum1:Desglose>:", hasDesglose);
    console.log("Desglose block (first 500 chars):", desgloseBlock?.substring(0, 500));
    
    if (!hasDesglose || !desgloseBlock || !desgloseBlock.includes('DetalleDesglose')) {
      console.error("CRITICAL: Desglose block missing or empty in XML!");
      console.error("XML body (first 3000 chars):", xmlBody.substring(0, 3000));
      throw new Error("Error crítico: El bloque Desglose no contiene DetalleDesglose válido");
    }
    
    // VERIFICATION: Ensure DescripcionOperacion is present and not empty
    const descOpMatch = xmlBody.match(/<sum1:DescripcionOperacion>([^<]*)<\/sum1:DescripcionOperacion>/);
    if (!descOpMatch || !descOpMatch[1] || descOpMatch[1].trim().length === 0) {
      console.error("CRITICAL: DescripcionOperacion missing or empty in XML!");
      console.error("XML body (first 2000 chars):", xmlBody.substring(0, 2000));
      throw new Error("DescripcionOperacion está vacío o no se encuentra en el XML");
    }
    console.log("DescripcionOperacion verified in XML:", descOpMatch[1]);

    // VERIFICATION: Check XSD element order (must be DescripcionOperacion < Desglose < CuotaTotal < ImporteTotal)
    const descOpIdx = xmlBody.indexOf("<sum1:DescripcionOperacion>");
    const desgloseIdx = xmlBody.indexOf("<sum1:Desglose>");
    const cuotaTotalIdx = xmlBody.indexOf("<sum1:CuotaTotal>");
    const importeTotalIdx = xmlBody.indexOf("<sum1:ImporteTotal>");
    console.log("XSD element order check - DescripcionOperacion:", descOpIdx, "Desglose:", desgloseIdx, "CuotaTotal:", cuotaTotalIdx, "ImporteTotal:", importeTotalIdx);
    if (!(descOpIdx < desgloseIdx && desgloseIdx < cuotaTotalIdx && cuotaTotalIdx < importeTotalIdx)) {
      console.error("CRITICAL: XML element order violates XSD! Expected: DescripcionOperacion < Desglose < CuotaTotal < ImporteTotal");
      throw new Error("Error crítico: Orden de elementos XML no cumple con el XSD de AEAT");
    }

    // Sign and build complete SOAP envelope
    const signedXml = buildSignedSOAPEnvelope(xmlBody, certData.privateKey, certData.certificate);
    console.log("Built signed SOAP envelope, length:", signedXml.length);

    // Send to AEAT with mTLS using extracted certificate
    const aeatResult = await sendToAEAT(signedXml, environment, certData.privateKey, certData.certificate);

    // Generate QR URL
    const nifEmisor = center.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';
    const fechaExpedicion = formatDateVerifactu(invoice.issue_date);
    const qrUrl = generateQRUrl(nifEmisor, invoice.invoice_number, fechaExpedicion, Number(invoice.total), environment);

    // Extract CSV from response
    const csv = aeatResult.response ? extractCSV(aeatResult.response) : null;

    // Log the event
    await logVerifactuEvent(supabase, {
      invoice_id,
      center_id: invoice.center_id,
      event_type: aeatResult.success ? 'alta' : 'error',
      aeat_csv: csv,
      aeat_response_code: aeatResult.response ? extractResponseCode(aeatResult.response) : null,
      aeat_response_message: aeatResult.success ? 'Factura registrada correctamente' : aeatResult.error,
      aeat_response_xml: aeatResult.response,
      xml_sent: signedXml,
      environment,
      http_status: aeatResult.httpStatus,
      error_details: aeatResult.success ? null : aeatResult.error
    });

    if (!aeatResult.success) {
      // Check if it's a temporary AEAT unavailability (404 with "Desactivada temporalmente")
      const isTemporaryUnavailable = aeatResult.httpStatus === 404 && 
        (aeatResult.error?.includes('Desactivada temporalmente') || 
         aeatResult.error?.includes('no habilitado') ||
         aeatResult.response?.includes('Desactivada temporalmente'));

      // Update invoice with pending status for retry
      await supabase
        .from("invoices")
        .update({
          verifactu_pending: true,
          verifactu_retry_count: (invoice.verifactu_retry_count || 0) + 1
        })
        .eq("id", invoice_id);

      // Return different response based on error type
      if (isTemporaryUnavailable) {
        // AEAT is temporarily down - return success with pending status
        return new Response(
          JSON.stringify({ 
            success: false,
            pending: true,
            aeat_unavailable: true,
            invoice_number: invoice.invoice_number,
            message: "La Agencia Tributaria no está disponible temporalmente. Se reintentará automáticamente más tarde.",
            retry_count: (invoice.verifactu_retry_count || 0) + 1
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Other AEAT errors
      return new Response(
        JSON.stringify({ 
          error: `Error de AEAT: ${aeatResult.error}`,
          details: aeatResult.response,
          httpStatus: aeatResult.httpStatus
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update invoice with Verifactu data
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        invoice_hash: invoiceHash,
        previous_invoice_hash: previousHash,
        verifactu_hash: invoiceHash,
        verifactu_qr: qrUrl,
        verifactu_timestamp: generationTimestamp,
        verifactu_registration_id: csv,
        verifactu_pending: false,
        verifactu_retry_count: 0
      })
      .eq("id", invoice_id);

    if (updateError) {
      console.error("Error updating invoice:", updateError);
      return new Response(
        JSON.stringify({ error: "Error actualizando la factura" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Invoice signed and registered successfully");

    return new Response(
      JSON.stringify({
        success: true,
        invoice_number: invoice.invoice_number,
        hash: invoiceHash,
        qr_url: qrUrl,
        csv: csv,
        timestamp: generationTimestamp,
        environment
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in sign-invoice-verifactu:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
