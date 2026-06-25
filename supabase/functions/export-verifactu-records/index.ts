import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeFiscalCenterRequest } from "../_shared/fiscalAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function cdata(str: string | null | undefined): string {
  return `<![CDATA[${(str || '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function buildCanonicalRecordsExportXML(records: any[], center: any, events: any[]): string {
  const nifEmisor = center.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';
  const nombreEmisor = center.name || '';
  const softwareName = center.verifactu_software_name || 'Psycma';
  const softwareVersion = center.verifactu_software_version || '1.0.0';
  const softwareNif = center.verifactu_software_nif || nifEmisor;
  const exportDate = new Date().toISOString();

  const registrosXML = records.map((record) => `
    <RegistroCanonico>
      <ID>${record.id}</ID>
      <Tipo>${record.record_type}</Tipo>
      <FacturaID>${record.invoice_id}</FacturaID>
      <NumSerieFactura>${escapeXML(record.invoice_number)}</NumSerieFactura>
      <FechaExpedicionFactura>${formatDateVerifactu(record.invoice_issue_date)}</FechaExpedicionFactura>
      <Huella>${record.hash}</Huella>
      ${record.previous_hash ? `<HuellaAnterior>${record.previous_hash}</HuellaAnterior>` : '<PrimerRegistro>S</PrimerRegistro>'}
      ${record.previous_record_id ? `<RegistroAnteriorID>${record.previous_record_id}</RegistroAnteriorID>` : ''}
      <EstadoAEAT>${record.aeat_status}</EstadoAEAT>
      ${record.aeat_csv ? `<CSV>${record.aeat_csv}</CSV>` : ''}
      <Entorno>${record.environment}</Entorno>
      <FechaHoraGeneracion>${record.created_at}</FechaHoraGeneracion>
      <XMLCanonicoEnviado>${cdata(record.xml_sent)}</XMLCanonicoEnviado>
      <RespuestaAEAT>${cdata(record.aeat_response_xml)}</RespuestaAEAT>
    </RegistroCanonico>`).join('');

  const eventosXML = events.map((event) => `
    <EventoRegistro>
      <FechaHora>${event.created_at}</FechaHora>
      <TipoEvento>${event.event_type.toUpperCase()}</TipoEvento>
      <FacturaID>${event.invoice_id || 'N/A'}</FacturaID>
      ${event.aeat_csv ? `<CSV>${event.aeat_csv}</CSV>` : ''}
      <Entorno>${event.environment || 'test'}</Entorno>
      <EstadoHTTP>${event.http_status || 'N/A'}</EstadoHTTP>
      ${event.aeat_response_message ? `<MensajeRespuesta>${escapeXML(event.aeat_response_message)}</MensajeRespuesta>` : ''}
      ${event.error_details ? `<ErrorDetalles>${escapeXML(event.error_details)}</ErrorDetalles>` : ''}
    </EventoRegistro>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ExportacionVerifactuCanonica>
  <Cabecera>
    <FechaExportacion>${exportDate}</FechaExportacion>
    <ObligadoEmision>
      <NombreRazon>${escapeXML(nombreEmisor)}</NombreRazon>
      <NIF>${nifEmisor}</NIF>
    </ObligadoEmision>
    <SoftwareFacturacion>
      <NombreRazon>${escapeXML(softwareName)}</NombreRazon>
      <NIF>${softwareNif}</NIF>
      <Version>${softwareVersion}</Version>
    </SoftwareFacturacion>
    <Fuente>verifactu_records</Fuente>
    <TotalRegistros>${records.length}</TotalRegistros>
    <TotalEventos>${events.length}</TotalEventos>
  </Cabecera>
  <RegistrosCanonicos>${registrosXML}
  </RegistrosCanonicos>
  <RegistroEventos>${eventosXML}
  </RegistroEventos>
</ExportacionVerifactuCanonica>`;
}

// Build export XML following AEAT LibroRegistroFacturasEmitidas format
function buildExportXML(invoices: any[], center: any, events: any[]): string {
  const nifEmisor = center.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';
  const nombreEmisor = center.name || '';
  const softwareName = center.verifactu_software_name || 'Psycma';
  const softwareVersion = center.verifactu_software_version || '1.0.0';
  const softwareNif = center.verifactu_software_nif || nifEmisor;
  const exportDate = new Date().toISOString();

  let registrosXML = '';
  
  for (const invoice of invoices) {
    if (!invoice.invoice_hash) continue; // Skip unsigned invoices

    const fechaExpedicion = formatDateVerifactu(invoice.issue_date);
    const totalBase = Number(invoice.subtotal) || 0;
    const totalIVA = Number(invoice.tax_amount) || 0;
    
    // Determine invoice type
    let tipoFactura = 'F1';
    if (invoice.is_recapitulative) tipoFactura = 'F2';
    else if (invoice.rectified_invoice_id) {
      tipoFactura = invoice.rectification_type === 'substitution' ? 'R1' : 'R5';
    }

    const patientName = invoice.patients ? 
      `${invoice.patients.first_name} ${invoice.patients.last_name}`.trim() : 
      'Cliente';
    const patientTaxId = invoice.patients?.tax_id?.replace(/[^A-Z0-9]/gi, '') || '';

    registrosXML += `
    <RegistroFactura>
      <IDFactura>
        <IDEmisorFactura>${nifEmisor}</IDEmisorFactura>
        <NumSerieFactura>${escapeXML(invoice.invoice_number)}</NumSerieFactura>
        <FechaExpedicionFactura>${fechaExpedicion}</FechaExpedicionFactura>
      </IDFactura>
      <TipoFactura>${tipoFactura}</TipoFactura>
      <Destinatario>
        <NombreRazon>${escapeXML(patientName)}</NombreRazon>
        ${patientTaxId ? `<NIF>${patientTaxId}</NIF>` : ''}
      </Destinatario>
      <DescripcionOperacion>Servicios de psicología</DescripcionOperacion>
      <BaseImponible>${totalBase.toFixed(2)}</BaseImponible>
      <CuotaIVA>${totalIVA.toFixed(2)}</CuotaIVA>
      <ImporteTotal>${Number(invoice.total).toFixed(2)}</ImporteTotal>
      <HuellaRegistro>${invoice.invoice_hash}</HuellaRegistro>
      ${invoice.previous_invoice_hash ? `<HuellaAnterior>${invoice.previous_invoice_hash}</HuellaAnterior>` : '<PrimerRegistro>S</PrimerRegistro>'}
      <FechaHoraGeneracion>${invoice.verifactu_timestamp || invoice.created_at}</FechaHoraGeneracion>
      ${invoice.verifactu_registration_id ? `<CSV>${invoice.verifactu_registration_id}</CSV>` : ''}
      <Estado>${invoice.status === 'cancelled' ? 'ANULADA' : 'REGISTRADA'}</Estado>
    </RegistroFactura>`;
  }

  // Build events log XML
  let eventosXML = '';
  for (const event of events) {
    eventosXML += `
    <EventoRegistro>
      <FechaHora>${event.created_at}</FechaHora>
      <TipoEvento>${event.event_type.toUpperCase()}</TipoEvento>
      <FacturaID>${event.invoice_id || 'N/A'}</FacturaID>
      ${event.aeat_csv ? `<CSV>${event.aeat_csv}</CSV>` : ''}
      <Entorno>${event.environment || 'test'}</Entorno>
      <EstadoHTTP>${event.http_status || 'N/A'}</EstadoHTTP>
      ${event.aeat_response_message ? `<MensajeRespuesta>${escapeXML(event.aeat_response_message)}</MensajeRespuesta>` : ''}
      ${event.error_details ? `<ErrorDetalles>${escapeXML(event.error_details)}</ErrorDetalles>` : ''}
    </EventoRegistro>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<ExportacionVerifactu xmlns="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/ExportacionVerifactu.xsd">
  <Cabecera>
    <FechaExportacion>${exportDate}</FechaExportacion>
    <ObligadoEmision>
      <NombreRazon>${escapeXML(nombreEmisor)}</NombreRazon>
      <NIF>${nifEmisor}</NIF>
    </ObligadoEmision>
    <SoftwareFacturacion>
      <NombreRazon>${escapeXML(softwareName)}</NombreRazon>
      <NIF>${softwareNif}</NIF>
      <Version>${softwareVersion}</Version>
    </SoftwareFacturacion>
    <TotalRegistros>${invoices.filter(i => i.invoice_hash).length}</TotalRegistros>
    <TotalEventos>${events.length}</TotalEventos>
  </Cabecera>
  
  <LibroRegistroFacturasEmitidas>${registrosXML}
  </LibroRegistroFacturasEmitidas>
  
  <RegistroEventos>${eventosXML}
  </RegistroEventos>
  
  <DeclaracionResponsable>
    <TextoDeclaracion>El obligado tributario declara, bajo su responsabilidad, que los registros de facturación contenidos en este fichero son correctos y corresponden a las facturas emitidas por el software de facturación ${escapeXML(softwareName)} versión ${softwareVersion}.</TextoDeclaracion>
    <FechaDeclaracion>${exportDate}</FechaDeclaracion>
    <SoftwareDeclarante>
      <Nombre>${escapeXML(softwareName)}</Nombre>
      <NIF>${softwareNif}</NIF>
      <Version>${softwareVersion}</Version>
    </SoftwareDeclarante>
  </DeclaracionResponsable>
</ExportacionVerifactu>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { start_date, end_date, include_events = true } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fiscalAccess = await authorizeFiscalCenterRequest(req, supabase, {
      allowedRoles: ["admin"],
      corsHeaders,
    });
    if (!fiscalAccess.ok) return fiscalAccess.response;

    const centerId = fiscalAccess.context.centerId;

    // Fetch center data
    const { data: center } = await supabase
      .from('centers')
      .select('*')
      .eq('id', centerId)
      .single();

    if (!center) {
      return new Response(
        JSON.stringify({ error: "Centro no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let recordsQuery = supabase
      .from('verifactu_records')
      .select('*')
      .eq('center_id', centerId)
      .order('created_at', { ascending: true });

    if (start_date) {
      recordsQuery = recordsQuery.gte('invoice_issue_date', start_date);
    }
    if (end_date) {
      recordsQuery = recordsQuery.lte('invoice_issue_date', end_date);
    }

    const { data: records, error: recordsError } = await recordsQuery;

    if (recordsError) {
      console.error("Error fetching canonical Verifactu records:", recordsError);
      return new Response(
        JSON.stringify({ error: "Error al obtener registros Verifactu canónicos" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build query for invoices with Verifactu data
    let invoicesQuery = supabase
      .from('invoices')
      .select(`
        *,
        patients (first_name, last_name, tax_id)
      `)
      .eq('center_id', centerId)
      .not('invoice_hash', 'is', null)
      .order('issue_date', { ascending: true });

    if (start_date) {
      invoicesQuery = invoicesQuery.gte('issue_date', start_date);
    }
    if (end_date) {
      invoicesQuery = invoicesQuery.lte('issue_date', end_date);
    }

    const { data: invoices, error: invoicesError } = await invoicesQuery;

    if (invoicesError) {
      console.error("Error fetching invoices:", invoicesError);
      return new Response(
        JSON.stringify({ error: "Error al obtener facturas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch events if requested
    let events: any[] = [];
    if (include_events) {
      let eventsQuery = supabase
        .from('verifactu_events')
        .select('*')
        .eq('center_id', centerId)
        .order('created_at', { ascending: true });

      if (start_date) {
        eventsQuery = eventsQuery.gte('created_at', start_date);
      }
      if (end_date) {
        eventsQuery = eventsQuery.lte('created_at', end_date + 'T23:59:59');
      }

      const { data: eventData } = await eventsQuery;
      events = eventData || [];
    }

    console.log(`Exporting ${invoices?.length || 0} invoices and ${events.length} events for center ${centerId}`);

    const canonicalRecords = records || [];
    const xml = canonicalRecords.length > 0
      ? buildCanonicalRecordsExportXML(canonicalRecords, center, events)
      : buildExportXML(invoices || [], center, events);

    console.log(`Canonical Verifactu records exported: ${canonicalRecords.length}`);

    // Return XML with proper content type for download
    return new Response(xml, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="verifactu_export_${new Date().toISOString().split('T')[0]}.xml"`
      }
    });

  } catch (error) {
    console.error("Error exporting Verifactu records:", error);
    console.error("[export-verifactu-records] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
