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

// AEAT Verifactu endpoints for consultation - CORRECTED URLs
const AEAT_ENDPOINTS = {
  test: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ws/ConsultaLRSOAP",
  production: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/ConsultaLRSOAP"
};

// SOAPAction for Consulta (invoice query) - CORRECTED to simple string
const SOAP_ACTION_CONSULTA = "ConsultaLR";

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

function formatDateVerifactu(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function escapeXML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Build ConsultaFactu XML for invoice query
// sum: for container elements, sum1: for internal types
function buildConsultaXML(invoice: any, center: any): string {
  const nifEmisor = center.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';
  const nombreEmisor = center.name || '';
  const fechaExpedicion = formatDateVerifactu(invoice.issue_date);

  return `<sum:ConsultaFactuSistemaFacturacion>
      <sum:Cabecera>
        <sum1:IDVersion>1.0</sum1:IDVersion>
        <sum1:ObligadoEmision>
          <sum1:NombreRazon>${escapeXML(nombreEmisor)}</sum1:NombreRazon>
          <sum1:NIF>${nifEmisor}</sum1:NIF>
        </sum1:ObligadoEmision>
      </sum:Cabecera>
      <sum:FiltroConsulta>
        <sum1:IDFactura>
          <sum1:IDEmisorFactura>${nifEmisor}</sum1:IDEmisorFactura>
          <sum1:NumSerieFactura>${escapeXML(invoice.invoice_number)}</sum1:NumSerieFactura>
          <sum1:FechaExpedicionFactura>${fechaExpedicion}</sum1:FechaExpedicionFactura>
        </sum1:IDFactura>
      </sum:FiltroConsulta>
    </sum:ConsultaFactuSistemaFacturacion>`;
}

// Extract certificates from PKCS12 for XML signing
function extractCertificatesFromPKCS12(certificateBase64: string, certificatePassword: string): {
  privateKey: any;
  certificate: any;
} {
  console.log('Extracting certificates from PKCS12...');
  
  const p12Der = forge.util.decode64(certificateBase64);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certificatePassword);

  let privateKey: any = null;
  let endEntityCert: any = null;
  const allCertificates: any[] = [];

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

  // Find the end-entity certificate (matching private key)
  for (const cert of allCertificates) {
    try {
      const certPublicKey = forge.pki.publicKeyToPem(cert.publicKey);
      const derivedPublicKey = forge.pki.publicKeyToPem(forge.pki.rsa.setPublicKey(
        privateKey.n,
        privateKey.e
      ));
      if (certPublicKey === derivedPublicKey) {
        endEntityCert = cert;
        break;
      }
    } catch (e) {}
  }

  if (!endEntityCert) {
    endEntityCert = allCertificates[0];
  }

  console.log('Extracted certificate and private key for signing');

  return { privateKey, certificate: endEntityCert };
}

// Build complete signed SOAP envelope with namespaces on Envelope
function buildSignedSOAPEnvelope(body: string, privateKey: any, certificate: any): string {
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

// Send XML to AEAT with mTLS authentication
async function sendToAEAT(
  signedXml: string, 
  environment: string,
  privateKey: any,
  certificate: any
): Promise<{ success: boolean; response?: string; error?: string; httpStatus?: number }> {
  const endpoint = environment === 'production' ? AEAT_ENDPOINTS.production : AEAT_ENDPOINTS.test;
  
  try {
    console.log("Sending consultation to AEAT endpoint:", endpoint);
    console.log("Using SOAPAction:", SOAP_ACTION_CONSULTA);

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
        'SOAPAction': SOAP_ACTION_CONSULTA
      },
      body: signedXml,
      // @ts-ignore - Deno specific option for mTLS
      client: client
    });

    const responseText = await response.text();
    console.log("AEAT Consulta Response status:", response.status);
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

    return { success: true, response: responseText, httpStatus: response.status };
  } catch (error) {
    console.error("Error sending to AEAT:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Error de conexión' };
  }
}

// Parse consultation response
function parseConsultaResponse(responseXml: string): {
  found: boolean;
  status?: string;
  registrationDate?: string;
  csv?: string;
  error?: string;
} {
  if (responseXml.includes('faultstring') || responseXml.includes('CodigoError')) {
    const errorMatch = responseXml.match(/<[^>]*DescripcionError[^>]*>([^<]+)<\/[^>]*DescripcionError[^>]*>/i);
    const faultMatch = responseXml.match(/<faultstring>([^<]+)<\/faultstring>/i);
    return { found: false, error: errorMatch?.[1] || faultMatch?.[1] || 'Error desconocido' };
  }

  if (responseXml.includes('RegistroFactura') || responseXml.includes('DatosFactura')) {
    const csvMatch = responseXml.match(/<[^>]*CSV[^>]*>([^<]+)<\/[^>]*CSV[^>]*>/i);
    const statusMatch = responseXml.match(/<[^>]*Estado[^>]*>([^<]+)<\/[^>]*Estado[^>]*>/i);
    const dateMatch = responseXml.match(/<[^>]*FechaHora[^>]*>([^<]+)<\/[^>]*FechaHora[^>]*>/i);

    return {
      found: true,
      status: statusMatch?.[1] || 'Registrada',
      registrationDate: dateMatch?.[1],
      csv: csvMatch?.[1]
    };
  }

  return { found: false, error: 'Registro no encontrado en AEAT' };
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

    console.log(`Consulting Verifactu status for invoice ${invoice_id}`);

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        centers (
          id, name, tax_id,
          verifactu_certificate_base64, verifactu_certificate_password,
          verifactu_environment
        )
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Factura no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const center = invoice.centers;
    const environment = center?.verifactu_environment || 'test';

    if (!center?.verifactu_certificate_base64 || !center?.verifactu_certificate_password) {
      return new Response(
        JSON.stringify({ error: "Certificado Verifactu no configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt certificate data if encrypted
    const { certificate: decryptedCert, password: decryptedPassword } = await decryptCertificateData(
      center.verifactu_certificate_base64,
      center.verifactu_certificate_password
    );

    // Extract certificates for signing
    const certData = extractCertificatesFromPKCS12(decryptedCert, decryptedPassword);

    // Build and sign consultation XML
    const xmlBody = buildConsultaXML(invoice, center);
    const signedXml = buildSignedSOAPEnvelope(xmlBody, certData.privateKey, certData.certificate);

    // Send to AEAT with mTLS using extracted certificate
    const aeatResult = await sendToAEAT(signedXml, environment, certData.privateKey, certData.certificate);

    // Parse response
    const consultaResult = aeatResult.response ? parseConsultaResponse(aeatResult.response) : { found: false, error: 'Sin respuesta' };

    // Log consultation event
    await logVerifactuEvent(supabase, {
      invoice_id,
      center_id: invoice.center_id,
      event_type: 'consulta',
      aeat_csv: consultaResult.csv,
      aeat_response_message: consultaResult.found ? `Estado: ${consultaResult.status}` : consultaResult.error,
      aeat_response_xml: aeatResult.response,
      xml_sent: signedXml,
      environment,
      http_status: aeatResult.httpStatus
    });

    if (!aeatResult.success) {
      return new Response(
        JSON.stringify({ 
          error: `Error de AEAT: ${aeatResult.error}`,
          details: aeatResult.response
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        invoice_number: invoice.invoice_number,
        found: consultaResult.found,
        status: consultaResult.status,
        csv: consultaResult.csv,
        registration_date: consultaResult.registrationDate,
        error: consultaResult.error,
        environment,
        local_data: {
          hash: invoice.invoice_hash,
          timestamp: invoice.verifactu_timestamp,
          qr: invoice.verifactu_qr
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in consulta-registro-verifactu:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
