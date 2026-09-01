import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptSecret, encryptSecret } from '../_shared/crypto.ts';
import {
  DriveReconnectError,
  refreshDriveAccessToken,
  findOrCreateDriveFolder,
  uploadFileToDrive,
  sanitizeDriveFileName,
} from '../_shared/googleDrive.ts';
import { hasAuthenticatedJWT, unauthorizedResponse } from '../_shared/authGuard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!(await hasAuthenticatedJWT(req))) return unauthorizedResponse(corsHeaders);

  let expenseIdForErrorHandling: string | undefined;

  try {
    const { expense_id } = await req.json();
    expenseIdForErrorHandling = expense_id;
    if (!expense_id) {
      return new Response(JSON.stringify({ error: 'expense_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select('id, center_id, expense_date, description, attachment_path, drive_file_id')
      .eq('id', expense_id)
      .single();

    if (expenseError || !expense) {
      return new Response(JSON.stringify({ error: 'Expense not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!expense.attachment_path) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no_attachment' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (expense.drive_file_id) {
      // Already uploaded — no-op so this can be called again cheaply as a backfill.
      return new Response(JSON.stringify({ skipped: true, reason: 'already_uploaded' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: connection } = await supabase
      .from('center_drive_connections')
      .select('*')
      .eq('center_id', expense.center_id)
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
      .eq('id', expense.center_id)
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
        .eq('center_id', expense.center_id);
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('expense-receipts')
      .download(expense.attachment_path);

    if (downloadError || !fileData) {
      throw new Error('Receipt not found in expense-receipts storage');
    }

    const expenseDate = new Date(expense.expense_date);
    const year = String(expenseDate.getFullYear());
    const month = String(expenseDate.getMonth() + 1).padStart(2, '0');

    const gastosFolderId = await findOrCreateDriveFolder(accessToken, 'Gastos', connection.drive_root_folder_id);
    const yearFolderId = await findOrCreateDriveFolder(accessToken, year, gastosFolderId);
    const monthFolderId = await findOrCreateDriveFolder(accessToken, month, yearFolderId);

    const originalExt = expense.attachment_path.split('.').pop() || 'pdf';
    const dateStr = expenseDate.toISOString().split('T')[0];
    const fileName = `${dateStr}_${sanitizeDriveFileName(expense.description || 'gasto')}.${originalExt}`;
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const mimeType = fileData.type || 'application/octet-stream';

    const uploaded = await uploadFileToDrive(accessToken, monthFolderId, fileName, bytes, mimeType);
    const driveUrl = `https://drive.google.com/file/d/${uploaded.id}/view`;

    await supabase
      .from('expenses')
      .update({ drive_file_id: uploaded.id, drive_url: driveUrl })
      .eq('id', expense_id);

    await supabase
      .from('center_drive_connections')
      .update({ last_upload_at: new Date().toISOString(), last_upload_error: null })
      .eq('center_id', expense.center_id);

    return new Response(
      JSON.stringify({ success: true, drive_file_id: uploaded.id, drive_url: driveUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[upload-expense-receipt-to-drive] Error:', error);
    const isReconnect = error instanceof DriveReconnectError;
    const errorMessage = isReconnect
      ? 'El acceso a Google Drive fue revocado. Reconecta desde Configuración.'
      : (error instanceof Error ? error.message : 'Error desconocido al subir a Google Drive');

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      if (expenseIdForErrorHandling) {
        const { data: expense } = await supabase.from('expenses').select('center_id').eq('id', expenseIdForErrorHandling).single();
        if (expense?.center_id) {
          await supabase
            .from('center_drive_connections')
            .update({
              ...(isReconnect ? { needs_reconnect: true } : {}),
              last_upload_at: new Date().toISOString(),
              last_upload_error: errorMessage,
            })
            .eq('center_id', expense.center_id);
        }
      }
    } catch (cleanupError) {
      console.error('[upload-expense-receipt-to-drive] Error recording upload failure:', cleanupError);
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
