import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as forge from "https://esm.sh/node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function decryptCertificateData(
  certificateBase64: string, 
  certificatePassword: string
): Promise<{ certificate: string; password: string }> {
  const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
  
  // If no encryption key configured, assume data is not encrypted
  if (!encryptionKey) {
    console.log('No encryption key configured, using raw certificate data');
    return { certificate: certificateBase64, password: certificatePassword };
  }
  
  // Always try to decrypt when encryption key is available
  console.log('Decrypting certificate data...');
  try {
    const certificate = await decryptAES256GCM(certificateBase64, encryptionKey);
    const password = await decryptAES256GCM(certificatePassword, encryptionKey);
    console.log('Certificate data decrypted successfully');
    return { certificate, password };
  } catch (decryptError) {
    // If decryption fails, the data might be from before encryption was implemented
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

function formatTimestampVerifactu(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${day}-${month}-${year}T${hours}:${minutes}:${seconds}`;
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

function buildRegistroBajaXML(invoice: any, center: any, generationTimestamp: string): string {
  const nifEmisor = center.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';
  const nombreEmisor = center.name || '';
  const fechaExpedicion = formatDateVerifactu(invoice.issue_date);
  const softwareName = center.verifactu_software_name || 'Psycma';
  const softwareVersion = center.verifactu_software_version || '1.0.0';
  const softwareNif = center.verifactu_software_nif || nifEmisor;

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
        <sifac:RegistroAnulacion>
          <sifac:IDVersion>1.0</sifac:IDVersion>
          <sifac:IDFactura>
            <sifac:IDEmisorFactura>${nifEmisor}</sifac:IDEmisorFactura>
            <sifac:NumSerieFactura>${escapeXML(invoice.invoice_number)}</sifac:NumSerieFactura>
            <sifac:FechaExpedicionFactura>${fechaExpedicion}</sifac:FechaExpedicionFactura>
          </sifac:IDFactura>
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
        </sifac:RegistroAnulacion>
      </sifac:RegistroFactura>
    </sifac:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function signXML(xml: string, certificateBase64: string, certificatePassword: string): string {
  try {
    const p12Der = forge.util.decode64(certificateBase64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
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
    console.log("AEAT Cancellation Response status:", response.status);
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

    console.log(`Processing cancellation for invoice ${invoice_id}`);

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
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

    if (!invoice.invoice_hash) {
      return new Response(
        JSON.stringify({ error: "La factura no está registrada en Verifactu" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const center = invoice.centers;
    const environment = center?.verifactu_environment || 'test';

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

    // Decrypt certificate data if encrypted
    const { certificate: decryptedCert, password: decryptedPassword } = await decryptCertificateData(
      center.verifactu_certificate_base64,
      center.verifactu_certificate_password
    );

    const generationTimestamp = formatTimestampVerifactu(new Date());
    const xml = buildRegistroBajaXML(invoice, center, generationTimestamp);
    console.log("Generated cancellation XML for invoice:", invoice.invoice_number);

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

    const aeatResult = await sendToAEAT(signedXml, environment);
    const csv = aeatResult.response ? extractCSV(aeatResult.response) : null;

    if (!aeatResult.success) {
      console.error("AEAT cancellation error:", aeatResult.error);
      
      await logVerifactuEvent(supabase, {
        invoice_id,
        center_id: invoice.center_id,
        event_type: 'error',
        aeat_csv: csv,
        aeat_response_message: aeatResult.error,
        aeat_response_xml: aeatResult.response,
        xml_sent: signedXml,
        environment,
        http_status: aeatResult.httpStatus,
        error_details: `Error anulación: ${aeatResult.error}`
      });

      return new Response(
        JSON.stringify({ 
          error: `Error de AEAT: ${aeatResult.error}`,
          details: aeatResult.response
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        status: 'cancelled',
        verifactu_timestamp: new Date().toISOString()
      })
      .eq("id", invoice_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Error al actualizar la factura" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log successful cancellation event
    await logVerifactuEvent(supabase, {
      invoice_id,
      center_id: invoice.center_id,
      event_type: 'anulacion',
      aeat_csv: csv,
      aeat_response_message: 'Anulación aceptada',
      aeat_response_xml: aeatResult.response,
      xml_sent: signedXml,
      environment,
      http_status: aeatResult.httpStatus
    });

    console.log(`Invoice ${invoice.invoice_number} cancelled in Verifactu`);

    return new Response(
      JSON.stringify({
        success: true,
        invoice_number: invoice.invoice_number,
        csv: csv,
        timestamp: new Date().toISOString(),
        environment,
        message: "Factura anulada en AEAT correctamente"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error cancelling invoice:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});