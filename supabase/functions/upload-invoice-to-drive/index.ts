import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";
import {
  DriveReconnectError,
  refreshDriveAccessToken,
  findOrCreateDriveFolder,
  uploadFileToDrive,
  sanitizeDriveFileName,
} from "../_shared/googleDrive.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let invoiceIdForErrorHandling: string | undefined;

  try {
    const { invoice_id } = await req.json();
    invoiceIdForErrorHandling = invoice_id;
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: 'invoice_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, center_id, invoice_number, issue_date, rectified_invoice_id, drive_file_id')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (invoice.drive_file_id) {
      // Already uploaded - invoices are immutable once issued, nothing to redo.
      return new Response(JSON.stringify({ skipped: true, reason: 'already_uploaded' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: connection } = await supabase
      .from('center_drive_connections')
      .select('*')
      .eq('center_id', invoice.center_id)
      .maybeSingle();

    if (!connection || !connection.enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: 'not_connected' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (connection.needs_reconnect) {
      return new Response(JSON.stringify({ skipped: true, reason: 'needs_reconnect' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!connection.access_token_encrypted || !connection.refresh_token_encrypted || !connection.drive_root_folder_id) {
      return new Response(JSON.stringify({ skipped: true, reason: 'incomplete_connection' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: center } = await supabase
      .from('centers')
      .select('oauth_google_drive_client_id, oauth_google_drive_credentials')
      .eq('id', invoice.center_id)
      .single();

    if (!center?.oauth_google_drive_client_id || !center?.oauth_google_drive_credentials) {
      return new Response(JSON.stringify({ skipped: true, reason: 'missing_oauth_client' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let accessToken = await decryptSecret(connection.access_token_encrypted);
    const tokenExpiry = new Date(connection.token_expires_at);

    if (tokenExpiry <= new Date()) {
      const clientSecret = await decryptSecret(center.oauth_google_drive_credentials);
      const refreshToken = await decryptSecret(connection.refresh_token_encrypted);
      const newTokenData = await refreshDriveAccessToken(refreshToken, center.oauth_google_drive_client_id, clientSecret);
      accessToken = newTokenData.access_token;

      await supabase
        .from('center_drive_connections')
        .update({
          access_token_encrypted: await encryptSecret(accessToken),
          token_expires_at: new Date(Date.now() + newTokenData.expires_in * 1000).toISOString(),
        })
        .eq('center_id', invoice.center_id);
    }

    // Download the already-generated PDF from Supabase Storage.
    const filePath = `${invoice.center_id}/${invoice_id}.pdf`;
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('invoice-documents')
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error('PDF not found in invoice-documents storage - generate it first');
    }

    const issueDate = new Date(invoice.issue_date);
    const year = String(issueDate.getFullYear());
    const month = String(issueDate.getMonth() + 1).padStart(2, '0');
    const subfolder = invoice.rectified_invoice_id ? 'Rectificativas' : 'Emitidas';

    const facturasFolderId = await findOrCreateDriveFolder(accessToken, 'Facturas', connection.drive_root_folder_id);
    const typeFolderId = await findOrCreateDriveFolder(accessToken, subfolder, facturasFolderId);
    const yearFolderId = await findOrCreateDriveFolder(accessToken, year, typeFolderId);
    const monthFolderId = await findOrCreateDriveFolder(accessToken, month, yearFolderId);

    const dateStr = issueDate.toISOString().split('T')[0];
    const fileName = `${dateStr}_${sanitizeDriveFileName(invoice.invoice_number)}.pdf`;
    const bytes = new Uint8Array(await fileData.arrayBuffer());

    const uploaded = await uploadFileToDrive(accessToken, monthFolderId, fileName, bytes);
    const driveUrl = `https://drive.google.com/file/d/${uploaded.id}/view`;

    await supabase
      .from('invoices')
      .update({ drive_file_id: uploaded.id, drive_url: driveUrl })
      .eq('id', invoice_id);

    await supabase
      .from('center_drive_connections')
      .update({ last_upload_at: new Date().toISOString(), last_upload_error: null })
      .eq('center_id', invoice.center_id);

    return new Response(
      JSON.stringify({ success: true, drive_file_id: uploaded.id, drive_url: driveUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[upload-invoice-to-drive] Error:', error);
    const isReconnect = error instanceof DriveReconnectError;
    const errorMessage = isReconnect
      ? 'El acceso a Google Drive fue revocado. Reconecta desde Configuracion.'
      : (error instanceof Error ? error.message : 'Error desconocido al subir a Google Drive');

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      if (invoiceIdForErrorHandling) {
        const { data: invoice } = await supabase.from('invoices').select('center_id').eq('id', invoiceIdForErrorHandling).single();
        if (invoice?.center_id) {
          await supabase
            .from('center_drive_connections')
            .update({
              ...(isReconnect ? { needs_reconnect: true } : {}),
              last_upload_at: new Date().toISOString(),
              last_upload_error: errorMessage,
            })
            .eq('center_id', invoice.center_id);
        }
      }
    } catch (cleanupError) {
      console.error('[upload-invoice-to-drive] Error recording upload failure:', cleanupError);
    }

    if (isReconnect) {
      return new Response(JSON.stringify({ skipped: true, reason: 'needs_reconnect' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
