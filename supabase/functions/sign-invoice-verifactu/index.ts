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

// SOAPAction for Alta (invoice registration)
const SOAP_ACTION_ALTA = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SistemaFacturacion/altaRegistroFactura";

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
// Uses SINGLE namespace sum1 → SuministroLR.xsd for ALL Verifactu elements
// The namespace is declared on soapenv:Body, not on soapenv:Envelope
function buildRegistroAltaXML(invoice: any, center: any, patient: any, invoiceItems: any[], previousHash: string | null, generationTimestamp: string, invoiceHash: string): string {
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
          <sum1:DetalleDesglose>
            <sum1:Impuesto>01</sum1:Impuesto>
            <sum1:ClaveRegimen>01</sum1:ClaveRegimen>
            <sum1:CalificacionOperacion>E1</sum1:CalificacionOperacion>
            <sum1:BaseImponibleOImporteNoSujeto>${totalBase.toFixed(2)}</sum1:BaseImponibleOImporteNoSujeto>
          </sum1:DetalleDesglose>`;
  } else {
    const taxRate = Number(invoice.tax_rate) || 21;
    desgloseXML = `
          <sum1:DetalleDesglose>
            <sum1:Impuesto>01</sum1:Impuesto>
            <sum1:ClaveRegimen>01</sum1:ClaveRegimen>
            <sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion>
            <sum1:TipoImpositivo>${taxRate.toFixed(2)}</sum1:TipoImpositivo>
            <sum1:BaseImponibleOImporteNoSujeto>${totalBase.toFixed(2)}</sum1:BaseImponibleOImporteNoSujeto>
            <sum1:CuotaRepercutida>${totalIVA.toFixed(2)}</sum1:CuotaRepercutida>
          </sum1:DetalleDesglose>`;
  }

  // Build encadenamiento (chaining)
  let encadenamientoXML = '';
  if (previousHash) {
    encadenamientoXML = `
            <sum1:RegistroAnterior>
              <sum1:IDEmisorFactura>${nifEmisor}</sum1:IDEmisorFactura>
              <sum1:NumSerieFactura>${escapeXML(invoice.invoice_number)}</sum1:NumSerieFactura>
              <sum1:FechaExpedicionFactura>${fechaExpedicion}</sum1:FechaExpedicionFactura>
              <sum1:Huella>${previousHash}</sum1:Huella>
            </sum1:RegistroAnterior>`;
  } else {
    encadenamientoXML = `<sum1:PrimerRegistro>S</sum1:PrimerRegistro>`;
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
          <sum1:FacturasRectificadas>
            <sum1:IDFacturaRectificada>
              <sum1:IDEmisorFactura>${nifEmisor}</sum1:IDEmisorFactura>
              <sum1:NumSerieFactura>${escapeXML(invoice.rectified_invoice.invoice_number)}</sum1:NumSerieFactura>
              <sum1:FechaExpedicionFactura>${formatDateVerifactu(invoice.rectified_invoice.issue_date)}</sum1:FechaExpedicionFactura>
            </sum1:IDFacturaRectificada>
          </sum1:FacturasRectificadas>`;
  }

  // Build Destinatarios section - only include if patient has NIF
  let destinatariosXML = '';
  if (patientTaxId) {
    destinatariosXML = `
          <sum1:Destinatarios>
            <sum1:IDDestinatario>
              <sum1:NombreRazon>${escapeXML(patientName)}</sum1:NombreRazon>
              <sum1:NIF>${patientTaxId}</sum1:NIF>
            </sum1:IDDestinatario>
          </sum1:Destinatarios>`;
  }

  // Build the body content (will be wrapped with namespace in buildSignedSOAPEnvelope)
  return `<sum1:RegFactuSistemaFacturacion>
      <sum1:Cabecera>
        <sum1:IDVersion>1.0</sum1:IDVersion>
        <sum1:ObligadoEmision>
          <sum1:NombreRazon>${escapeXML(nombreEmisor)}</sum1:NombreRazon>
          <sum1:NIF>${nifEmisor}</sum1:NIF>
        </sum1:ObligadoEmision>
      </sum1:Cabecera>
      <sum1:RegistroFactura>
        <sum1:RegistroAlta>
          <sum1:IDFactura>
            <sum1:IDEmisorFactura>${nifEmisor}</sum1:IDEmisorFactura>
            <sum1:NumSerieFactura>${escapeXML(invoice.invoice_number)}</sum1:NumSerieFactura>
            <sum1:FechaExpedicionFactura>${fechaExpedicion}</sum1:FechaExpedicionFactura>
          </sum1:IDFactura>
          <sum1:NombreRazonEmisor>${escapeXML(nombreEmisor)}</sum1:NombreRazonEmisor>
          <sum1:TipoFactura>${tipoFactura}</sum1:TipoFactura>${facturasRectificadasXML}
          <sum1:DescripcionOperacion>Servicios de psicología</sum1:DescripcionOperacion>${destinatariosXML}
          <sum1:Desglose>${desgloseXML}
          </sum1:Desglose>
          <sum1:CuotaTotal>${totalIVA.toFixed(2)}</sum1:CuotaTotal>
          <sum1:ImporteTotal>${Number(invoice.total).toFixed(2)}</sum1:ImporteTotal>
          <sum1:Encadenamiento>
            ${encadenamientoXML}
          </sum1:Encadenamiento>
          <sum1:SistemaInformatico>
            <sum1:NombreRazon>${escapeXML(softwareName)}</sum1:NombreRazon>
            <sum1:NIF>${softwareNif}</sum1:NIF>
            <sum1:NombreSistemaInformatico>${escapeXML(softwareName)}</sum1:NombreSistemaInformatico>
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
      </sum1:RegistroFactura>
    </sum1:RegFactuSistemaFacturacion>`;
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

// Extract certificates from PKCS12 and return PEM format for mTLS
function extractCertificatesFromPKCS12(certificateBase64: string, certificatePassword: string): {
  privateKey: forge.pki.PrivateKey;
  certificate: forge.pki.Certificate;
  certPem: string;
  keyPem: string;
} {
  console.log('Attempting to decode certificate, base64 length:', certificateBase64.length);
  console.log('Certificate password length:', certificatePassword.length);
  
  const p12Der = forge.util.decode64(certificateBase64);
  console.log('Decoded DER length:', p12Der.length);
  
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  console.log('Parsed ASN1 successfully');
  
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certificatePassword);

  let privateKey: forge.pki.PrivateKey | null = null;
  let endEntityCert: forge.pki.Certificate | null = null;
  const allCertificates: forge.pki.Certificate[] = [];

  // Extract all certificates and private key
  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && safeBag.key) {
        privateKey = safeBag.key as forge.pki.PrivateKey;
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
      // The end-entity cert is the one whose public key matches the private key
      const certPublicKey = forge.pki.publicKeyToPem(cert.publicKey);
      const derivedPublicKey = forge.pki.publicKeyToPem(forge.pki.rsa.setPublicKey(
        (privateKey as any).n,
        (privateKey as any).e
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

  // If no match found, use the first certificate (common case for simple PKCS12)
  if (!endEntityCert) {
    endEntityCert = allCertificates[0];
    console.log('Using first certificate as end-entity');
  }

  // Build certificate chain PEM (end-entity first, then CA certs)
  let certChainPem = forge.pki.certificateToPem(endEntityCert);
  
  // Add intermediate/CA certificates to the chain
  for (const cert of allCertificates) {
    if (cert !== endEntityCert) {
      certChainPem += forge.pki.certificateToPem(cert);
      console.log('Added CA/intermediate certificate to chain');
    }
  }

  const keyPem = forge.pki.privateKeyToPem(privateKey);
  
  console.log('Extracted certificate chain and key in PEM format');

  return { privateKey, certificate: endEntityCert, certPem: certChainPem, keyPem };
}

// Build complete signed SOAP envelope with namespace on Body
function buildSignedSOAPEnvelope(body: string, privateKey: forge.pki.PrivateKey, certificate: forge.pki.Certificate): string {
  const xmlnsSum1 = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';

  // Create the full body with namespace
  const fullBody = `<soapenv:Body xmlns:sum1="${xmlnsSum1}">${body}</soapenv:Body>`;

  // Sign the body
  const signature = signXMLBody(fullBody, privateKey, certificate);

  // Build complete SOAP envelope
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header>
    ${signature}
  </soapenv:Header>
  <soapenv:Body xmlns:sum1="${xmlnsSum1}">
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`;
}

// Sign XML body and return signature element
function signXMLBody(body: string, privateKey: forge.pki.PrivateKey, certificate: forge.pki.Certificate): string {
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
    const signature = (privateKey as any).sign(md);
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
  const codeMatch = responseXml.match(/<[^>]*CodigoError[^>]*>([^<]+)<\/[^>]*CodigoError[^>]*>/i);
  return codeMatch?.[1] || null;
}

// Send to AEAT with mTLS (client certificate authentication)
async function sendToAEAT(
  signedXml: string, 
  environment: string,
  certPem: string,
  keyPem: string
): Promise<{ success: boolean; response?: string; error?: string; httpStatus?: number }> {
  const endpoint = environment === 'production' ? AEAT_ENDPOINTS.production : AEAT_ENDPOINTS.test;
  
  try {
    // Create HTTP client with client certificate for mTLS
    console.log("Creating mTLS HTTP client for AEAT connection...");
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
      // @ts-ignore - Deno specific option
      client: client
    });

    const responseText = await response.text();
    console.log("AEAT Response status:", response.status);
    console.log("AEAT Response:", responseText.substring(0, 1000));

    // Close the client after use
    client.close();

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${responseText}`, httpStatus: response.status };
    }

    // Detectar página de error HTML (AEAT devuelve 200 pero con HTML de error)
    if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html')) {
      const titleMatch = responseText.match(/<title>[^<]*?(\d{3})[^<]*?<\/title>/i);
      const errorCode = titleMatch?.[1] || 'HTML';
      console.error(`AEAT returned HTML error page with code ${errorCode}`);
      return { 
        success: false, 
        error: `AEAT devolvió página de error ${errorCode} - El certificado no está autorizado o hay un problema de configuración`, 
        response: responseText, 
        httpStatus: response.status 
      };
    }

    // Verificar que es una respuesta SOAP válida de Verifactu
    if (!responseText.includes('sifac:') && !responseText.includes('RespuestaRegFactuSistemaFacturacion') && !responseText.includes('soap:') && !responseText.includes('soapenv:')) {
      console.error("AEAT response is not valid Verifactu SOAP XML");
      return { 
        success: false, 
        error: 'Respuesta inesperada de AEAT - no es XML Verifactu válido', 
        response: responseText, 
        httpStatus: response.status 
      };
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

    // Build XML body content
    const xmlBody = buildRegistroAltaXML(invoice, center, patient, invoiceItems || [], previousHash, generationTimestamp, invoiceHash);
    console.log("Generated XML for invoice:", invoice.invoice_number);

    // Decrypt certificate data if encrypted
    const { certificate: decryptedCert, password: decryptedPassword } = await decryptCertificateData(
      center.verifactu_certificate_base64,
      center.verifactu_certificate_password
    );

    // Extract certificates and get PEM format for mTLS
    let certData: { privateKey: forge.pki.PrivateKey; certificate: forge.pki.Certificate; certPem: string; keyPem: string };
    try {
      certData = extractCertificatesFromPKCS12(decryptedCert, decryptedPassword);
    } catch (certError) {
      await logVerifactuEvent(supabase, {
        invoice_id,
        center_id: invoice.center_id,
        event_type: 'error',
        environment,
        xml_sent: xmlBody,
        error_details: `Error al extraer certificado: ${certError instanceof Error ? certError.message : 'Unknown'}`
      });
      throw certError;
    }

    // Build complete signed SOAP envelope
    let signedXml: string;
    try {
      signedXml = buildSignedSOAPEnvelope(xmlBody, certData.privateKey, certData.certificate);
    } catch (signError) {
      await logVerifactuEvent(supabase, {
        invoice_id,
        center_id: invoice.center_id,
        event_type: 'error',
        environment,
        xml_sent: xmlBody,
        error_details: `Error al firmar: ${signError instanceof Error ? signError.message : 'Unknown'}`
      });
      throw signError;
    }

    // Send to AEAT with mTLS
    const aeatResult = await sendToAEAT(signedXml, environment, certData.certPem, certData.keyPem);

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
