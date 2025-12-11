import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import forge from "https://esm.sh/node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AEAT Verifactu endpoints
const AEAT_ENDPOINTS = {
  test: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  production: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
};

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
  // If we have the encryption key and the data looks like it could be encrypted
  // (starts with something other than expected PFX header when decoded)
  try {
    const decoded = base64ToBytes(data);
    // Encrypted data has format: IV (12 bytes) + ciphertext
    // PFX files start with ASN.1 SEQUENCE (0x30) followed by length bytes
    // If the data is exactly 12+ bytes and first byte is NOT 0x30, likely encrypted
    // However, IV is random, so we can't rely on first byte alone
    
    // Better heuristic: PFX files have a specific ASN.1 structure
    // After 0x30, next bytes indicate length. For small files (< 128 bytes total length),
    // byte 2 is the length. For larger files, byte 2 is 0x82 (2-byte length follows)
    // Most PFX files are large, so we'd see: 0x30 0x82 <high> <low>
    
    if (decoded.length > 4) {
      const byte0 = decoded[0];
      const byte1 = decoded[1];
      
      // Standard PFX starts with 0x30 0x82 (SEQUENCE with 2-byte length)
      if (byte0 === 0x30 && (byte1 === 0x82 || byte1 === 0x83 || byte1 < 0x80)) {
        console.log('Data appears to be unencrypted PFX (starts with 0x30)');
        return false;
      }
    }
    
    // Assume encrypted
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
  
  if (!encryptionKey || !isEncrypted(certificateBase64)) {
    console.log('Using unencrypted certificate data');
    return { certificate: certificateBase64, password: certificatePassword };
  }
  
  console.log('Decrypting certificate data...');
  const certificate = await decryptAES256GCM(certificateBase64, encryptionKey);
  const password = await decryptAES256GCM(certificatePassword, encryptionKey);
  console.log('Certificate data decrypted successfully');
  
  return { certificate, password };
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

// Format timestamp for Verifactu
function formatTimestampVerifactu(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${day}-${month}-${year}T${hours}:${minutes}:${seconds}`;
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

// Build RegistroAlta XML for invoice registration
function buildRegistroAltaXML(invoice: any, center: any, patient: any, invoiceItems: any[], previousHash: string | null, generationTimestamp: string): string {
  const nifEmisor = center.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';
  const nombreEmisor = center.name || '';
  const fechaExpedicion = formatDateVerifactu(invoice.issue_date);
  
  const patientTaxId = patient?.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';
  const patientName = patient ? `${patient.first_name} ${patient.last_name}`.trim() : 'Cliente';
  
  // Build desglose (breakdown)
  let desgloseXML = '';
  const totalBase = Number(invoice.subtotal) || 0;
  const totalIVA = Number(invoice.tax_amount) || 0;
  
  if (totalIVA === 0) {
    // Exempt operation (healthcare services)
    desgloseXML = `
        <sifac:Desglose>
          <sifac:DetalleDesglose>
            <sifac:Impuesto>01</sifac:Impuesto>
            <sifac:ClaveRegimen>01</sifac:ClaveRegimen>
            <sifac:CalificacionOperacion>E1</sifac:CalificacionOperacion>
            <sifac:BaseImponibleOimporteNoSujeto>${totalBase.toFixed(2)}</sifac:BaseImponibleOimporteNoSujeto>
          </sifac:DetalleDesglose>
        </sifac:Desglose>`;
  } else {
    const taxRate = Number(invoice.tax_rate) || 21;
    desgloseXML = `
        <sifac:Desglose>
          <sifac:DetalleDesglose>
            <sifac:Impuesto>01</sifac:Impuesto>
            <sifac:ClaveRegimen>01</sifac:ClaveRegimen>
            <sifac:TipoImpositivo>${taxRate.toFixed(2)}</sifac:TipoImpositivo>
            <sifac:BaseImponibleOimporteNoSujeto>${totalBase.toFixed(2)}</sifac:BaseImponibleOimporteNoSujeto>
            <sifac:CuotaRepercutida>${totalIVA.toFixed(2)}</sifac:CuotaRepercutida>
          </sifac:DetalleDesglose>
        </sifac:Desglose>`;
  }

  // Build encadenamiento (chaining)
  let encadenamientoXML = '';
  if (previousHash) {
    encadenamientoXML = `
        <sifac:Encadenamiento>
          <sifac:RegistroAnterior>
            <sifac:Huella>${previousHash}</sifac:Huella>
          </sifac:RegistroAnterior>
        </sifac:Encadenamiento>`;
  } else {
    encadenamientoXML = `
        <sifac:Encadenamiento>
          <sifac:PrimerRegistro>S</sifac:PrimerRegistro>
        </sifac:Encadenamiento>`;
  }

  // Software info
  const softwareName = center.verifactu_software_name || 'Psycma';
  const softwareVersion = center.verifactu_software_version || '1.0.0';
  const softwareNif = center.verifactu_software_nif || nifEmisor;

  // Determine invoice type
  let tipoFactura = 'F1'; // Factura normal
  if (invoice.is_recapitulative) {
    tipoFactura = 'F2'; // Factura recapitulativa
  } else if (invoice.rectified_invoice_id) {
    tipoFactura = invoice.rectification_type === 'substitution' ? 'R1' : 'R5'; // Rectificativa
  }

  // Build rectified invoice reference if applicable
  let facturasRectificadasXML = '';
  if (invoice.rectified_invoice_id && invoice.rectified_invoice) {
    facturasRectificadasXML = `
          <sifac:FacturasRectificadas>
            <sifac:IDFacturaRectificada>
              <sifac:IDEmisorFactura>${nifEmisor}</sifac:IDEmisorFactura>
              <sifac:NumSerieFactura>${escapeXML(invoice.rectified_invoice.invoice_number)}</sifac:NumSerieFactura>
              <sifac:FechaExpedicionFactura>${formatDateVerifactu(invoice.rectified_invoice.issue_date)}</sifac:FechaExpedicionFactura>
            </sifac:IDFacturaRectificada>
          </sifac:FacturasRectificadas>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:sifac="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sifac:RegFactuSistemaFacturacion>
      <sifac:Cabecera>
        <sifac:ObligadoEmision>
          <sifac:NombreRazon>${escapeXML(nombreEmisor)}</sifac:NombreRazon>
          <sifac:NIF>${nifEmisor}</sifac:NIF>
        </sifac:ObligadoEmision>
      </sifac:Cabecera>
      <sifac:RegistroFactura>
        <sifac:RegistroAlta>
          <sifac:IDVersion>1.0</sifac:IDVersion>
          <sifac:IDFactura>
            <sifac:IDEmisorFactura>${nifEmisor}</sifac:IDEmisorFactura>
            <sifac:NumSerieFactura>${escapeXML(invoice.invoice_number)}</sifac:NumSerieFactura>
            <sifac:FechaExpedicionFactura>${fechaExpedicion}</sifac:FechaExpedicionFactura>
          </sifac:IDFactura>
          <sifac:NombreRazonEmisor>${escapeXML(nombreEmisor)}</sifac:NombreRazonEmisor>
          <sifac:TipoFactura>${tipoFactura}</sifac:TipoFactura>${facturasRectificadasXML}
          <sifac:DescripcionOperacion>Servicios de psicología</sifac:DescripcionOperacion>
          <sifac:Destinatarios>
            <sifac:IDDestinatario>
              <sifac:NombreRazon>${escapeXML(patientName)}</sifac:NombreRazon>
              ${patientTaxId ? `<sifac:NIF>${patientTaxId}</sifac:NIF>` : ''}
            </sifac:IDDestinatario>
          </sifac:Destinatarios>${desgloseXML}
          <sifac:CuotaTotal>${totalIVA.toFixed(2)}</sifac:CuotaTotal>
          <sifac:ImporteTotal>${Number(invoice.total).toFixed(2)}</sifac:ImporteTotal>${encadenamientoXML}
          <sifac:SistemaInformatico>
            <sifac:NombreRazon>${escapeXML(softwareName)}</sifac:NombreRazon>
            <sifac:NIF>${softwareNif}</sifac:NIF>
            <sifac:IdSistemaInformatico>${escapeXML(softwareName)}</sifac:IdSistemaInformatico>
            <sifac:Version>${softwareVersion}</sifac:Version>
            <sifac:NumeroInstalacion>1</sifac:NumeroInstalacion>
            <sifac:TipoUsoPosibleSoloVerifactu>S</sifac:TipoUsoPosibleSoloVerifactu>
            <sifac:TipoUsoPosibleMultiOT>N</sifac:TipoUsoPosibleMultiOT>
            <sifac:IndicadorMultiplesOT>N</sifac:IndicadorMultiplesOT>
          </sifac:SistemaInformatico>
          <sifac:FechaHoraHusoGenRegistro>${generationTimestamp}</sifac:FechaHoraHusoGenRegistro>
          <sifac:TipoHuella>01</sifac:TipoHuella>
        </sifac:RegistroAlta>
      </sifac:RegistroFactura>
    </sifac:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
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

// Calculate hash for chaining (Huella)
async function calculateInvoiceHash(invoice: any, center: any, previousHash: string | null, timestamp: string): Promise<string> {
  const nifEmisor = center.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';
  const numSerie = invoice.invoice_number || '';
  const fechaExpedicion = formatDateVerifactu(invoice.issue_date);
  const tipoFactura = invoice.is_recapitulative ? 'F2' : 'F1';
  const cuotaTotal = (Number(invoice.tax_amount) || 0).toFixed(2);
  const importeTotal = Number(invoice.total).toFixed(2);
  const huellaAnterior = previousHash || '';
  
  const dataToHash = `IDEmisorFactura=${nifEmisor}&NumSerieFactura=${numSerie}&FechaExpedicionFactura=${fechaExpedicion}&TipoFactura=${tipoFactura}&CuotaTotal=${cuotaTotal}&ImporteTotal=${importeTotal}&Huella=${huellaAnterior}&FechaHoraHusoGenRegistro=${timestamp}`;
  
  return await generateSHA256(dataToHash);
}

// Sign XML with PKCS12 certificate
function signXML(xml: string, certificateBase64: string, certificatePassword: string): string {
  try {
    console.log('Attempting to decode certificate, base64 length:', certificateBase64.length);
    console.log('Certificate password length:', certificatePassword.length);
    
    const p12Der = forge.util.decode64(certificateBase64);
    console.log('Decoded DER length:', p12Der.length);
    
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    console.log('Parsed ASN1 successfully');
    
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certificatePassword);

    let privateKey: forge.pki.PrivateKey | null = null;
    let certificate: forge.pki.Certificate | null = null;

    for (const safeContents of p12.safeContents) {
      for (const safeBag of safeContents.safeBags) {
        if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && safeBag.key) {
          privateKey = safeBag.key as forge.pki.PrivateKey;
        } else if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
          certificate = safeBag.cert;
        }
      }
    }

    if (!privateKey || !certificate) {
      throw new Error("No se pudo extraer la clave privada o el certificado");
    }

    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
    const certBase64 = forge.util.encode64(certDer);

    const md = forge.md.sha256.create();
    md.update(xml, 'utf8');
    const digest = forge.util.encode64(md.digest().bytes());

    const signature = (privateKey as any).sign(md);
    const signatureBase64 = forge.util.encode64(signature);

    const signedXml = xml.replace(
      '</soapenv:Header>',
      `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:SignedInfo>
          <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
          <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
          <ds:Reference URI="">
            <ds:Transforms>
              <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
            </ds:Transforms>
            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
            <ds:DigestValue>${digest}</ds:DigestValue>
          </ds:Reference>
        </ds:SignedInfo>
        <ds:SignatureValue>${signatureBase64}</ds:SignatureValue>
        <ds:KeyInfo>
          <ds:X509Data>
            <ds:X509Certificate>${certBase64}</ds:X509Certificate>
          </ds:X509Data>
        </ds:KeyInfo>
      </ds:Signature>
    </soapenv:Header>`
    );

    return signedXml;
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
  const codeMatch = responseXml.match(/<[^>]*CodigoError[^>]*>([^<]+)<\/[^>]*CodigoError[^>]*>/i);
  return codeMatch?.[1] || null;
}

// Send to AEAT
async function sendToAEAT(signedXml: string, environment: string): Promise<{ success: boolean; response?: string; error?: string; httpStatus?: number }> {
  const endpoint = environment === 'production' ? AEAT_ENDPOINTS.production : AEAT_ENDPOINTS.test;
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'RegFactuSistemaFacturacion'
      },
      body: signedXml
    });

    const responseText = await response.text();
    console.log("AEAT Response status:", response.status);
    console.log("AEAT Response:", responseText.substring(0, 1000));

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${responseText}`, httpStatus: response.status };
    }

    if (responseText.includes('<sifac:CodigoErrorRegistro>') || responseText.includes('faultstring')) {
      const errorMatch = responseText.match(/<sifac:DescripcionErrorRegistro>([^<]+)<\/sifac:DescripcionErrorRegistro>/);
      const faultMatch = responseText.match(/<faultstring>([^<]+)<\/faultstring>/);
      const errorMessage = errorMatch?.[1] || faultMatch?.[1] || 'Error desconocido de AEAT';
      return { success: false, error: errorMessage, response: responseText, httpStatus: response.status };
    }

    return { success: true, response: responseText, httpStatus: response.status };
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
  retry_count?: number;
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

    // Fetch invoice with relations
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        patients (id, first_name, last_name, tax_id, address, city, postal_code),
        centers (
          id, name, tax_id, address, city, postal_code,
          verifactu_certificate_base64, verifactu_certificate_password,
          verifactu_environment, verifactu_software_name, 
          verifactu_software_version, verifactu_software_nif
        ),
        rectified_invoice:rectified_invoice_id (invoice_number, issue_date)
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

    // Check if already signed
    if (invoice.invoice_hash) {
      return new Response(
        JSON.stringify({ 
          error: "Factura ya firmada con Verifactu",
          hash: invoice.invoice_hash,
          timestamp: invoice.verifactu_timestamp
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const center = invoice.centers;
    const patient = invoice.patients;
    const environment = center?.verifactu_environment || 'test';

    // Validate certificate configuration
    if (!center?.verifactu_certificate_base64 || !center?.verifactu_certificate_password) {
      await logVerifactuEvent(supabase, {
        invoice_id,
        center_id: invoice.center_id,
        event_type: 'error',
        environment,
        error_details: 'Certificado Verifactu no configurado'
      });
      return new Response(
        JSON.stringify({ error: "Certificado Verifactu no configurado. Configure el certificado en Ajustes > Facturación > Verifactu" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate center tax_id
    if (!center?.tax_id) {
      await logVerifactuEvent(supabase, {
        invoice_id,
        center_id: invoice.center_id,
        event_type: 'error',
        environment,
        error_details: 'Centro sin NIF/CIF configurado'
      });
      return new Response(
        JSON.stringify({ error: "El centro debe tener un NIF/CIF configurado para usar Verifactu" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch invoice items
    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id);

    // Get previous invoice hash for chaining
    const { data: previousInvoice } = await supabase
      .from("invoices")
      .select("invoice_hash")
      .eq("center_id", invoice.center_id)
      .not("invoice_hash", "is", null)
      .order("verifactu_timestamp", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousHash = previousInvoice?.invoice_hash || null;
    const generationTimestamp = formatTimestampVerifactu(new Date());

    // Calculate invoice hash
    const invoiceHash = await calculateInvoiceHash(invoice, center, previousHash, generationTimestamp);

    // Build XML
    const xml = buildRegistroAltaXML(invoice, center, patient, invoiceItems || [], previousHash, generationTimestamp);
    console.log("Generated XML for invoice:", invoice.invoice_number);

    // Decrypt certificate data if encrypted
    const { certificate: decryptedCert, password: decryptedPassword } = await decryptCertificateData(
      center.verifactu_certificate_base64,
      center.verifactu_certificate_password
    );

    // Sign XML
    let signedXml: string;
    try {
      signedXml = signXML(xml, decryptedCert, decryptedPassword);
      console.log("XML signed successfully");
    } catch (signError) {
      await logVerifactuEvent(supabase, {
        invoice_id,
        center_id: invoice.center_id,
        event_type: 'error',
        environment,
        xml_sent: xml,
        error_details: `Error al firmar: ${signError instanceof Error ? signError.message : 'Unknown'}`
      });
      throw signError;
    }

    // Send to AEAT
    const aeatResult = await sendToAEAT(signedXml, environment);

    // Extract CSV and response code from AEAT response
    const csv = aeatResult.response ? extractCSV(aeatResult.response) : null;
    const responseCode = aeatResult.response ? extractResponseCode(aeatResult.response) : null;

    if (!aeatResult.success) {
      console.error("AEAT error:", aeatResult.error);
      
      // Log error event
      await logVerifactuEvent(supabase, {
        invoice_id,
        center_id: invoice.center_id,
        event_type: 'error',
        aeat_csv: csv,
        aeat_response_code: responseCode,
        aeat_response_message: aeatResult.error,
        aeat_response_xml: aeatResult.response,
        xml_sent: signedXml,
        environment,
        http_status: aeatResult.httpStatus,
        error_details: aeatResult.error
      });

      // Mark invoice as pending retry
      await supabase
        .from("invoices")
        .update({
          verifactu_pending: true,
          verifactu_retry_count: (invoice.verifactu_retry_count || 0) + 1
        })
        .eq("id", invoice_id);

      return new Response(
        JSON.stringify({ 
          error: `Error de AEAT: ${aeatResult.error}`,
          details: aeatResult.response
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate QR URL
    const qrUrl = generateQRUrl(
      center.tax_id.replace(/[^A-Z0-9]/gi, ''),
      invoice.invoice_number,
      formatDateVerifactu(invoice.issue_date),
      Number(invoice.total),
      environment
    );

    // Update invoice with Verifactu data
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        invoice_hash: invoiceHash,
        previous_invoice_hash: previousHash,
        verifactu_hash: invoiceHash,
        verifactu_timestamp: new Date().toISOString(),
        verifactu_qr: qrUrl,
        verifactu_registration_id: csv,
        status: 'issued',
        verifactu_pending: false,
        verifactu_retry_count: 0
      })
      .eq("id", invoice_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Error al actualizar la factura" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log successful event
    await logVerifactuEvent(supabase, {
      invoice_id,
      center_id: invoice.center_id,
      event_type: 'alta',
      aeat_csv: csv,
      aeat_response_code: responseCode,
      aeat_response_message: 'Registro aceptado',
      aeat_response_xml: aeatResult.response,
      xml_sent: signedXml,
      environment,
      http_status: aeatResult.httpStatus
    });

    console.log(`Invoice ${invoice.invoice_number} signed with hash: ${invoiceHash}`);

    return new Response(
      JSON.stringify({
        success: true,
        invoice_number: invoice.invoice_number,
        hash: invoiceHash,
        previous_hash: previousHash,
        qr_url: qrUrl,
        csv: csv,
        timestamp: new Date().toISOString(),
        environment,
        message: "Factura firmada y registrada en AEAT correctamente"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error signing invoice:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});