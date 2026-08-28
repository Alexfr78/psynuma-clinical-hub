import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";

function redirect(params: Record<string, string>): Response {
  const siteUrl = Deno.env.get('SITE_URL') || 'https://psycma.lovable.app';
  const url = new URL(`${siteUrl}/configuracion`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return Response.redirect(url.toString());
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('[google-drive-oauth-callback] OAuth error:', error);
      return redirect({ oauth: 'error', provider: 'google_drive', message: error });
    }
    if (!code || !state) {
      return redirect({ oauth: 'error', provider: 'google_drive', message: 'missing_params' });
    }

    let stateData: { center_id?: string; professional_id?: string; redirect_uri?: string };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return redirect({ oauth: 'error', provider: 'google_drive', message: 'invalid_state' });
    }

    const { center_id, professional_id, redirect_uri } = stateData;
    if (!center_id || !redirect_uri) {
      return redirect({ oauth: 'error', provider: 'google_drive', message: 'invalid_state' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('name, oauth_google_drive_client_id, oauth_google_drive_credentials')
      .eq('id', center_id)
      .single();

    if (centerError || !center?.oauth_google_drive_client_id || !center?.oauth_google_drive_credentials) {
      console.error('[google-drive-oauth-callback] Missing Drive OAuth credentials for center:', centerError);
      return redirect({ oauth: 'error', provider: 'google_drive', message: 'no_credentials' });
    }

    let clientSecret: string;
    try {
      clientSecret = await decryptSecret(center.oauth_google_drive_credentials);
    } catch (decryptError) {
      console.error('[google-drive-oauth-callback] Failed to decrypt credentials:', decryptError);
      return redirect({ oauth: 'error', provider: 'google_drive', message: 'decrypt_error' });
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: center.oauth_google_drive_client_id,
        client_secret: clientSecret,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('[google-drive-oauth-callback] Token exchange error:', tokenData);
      return redirect({ oauth: 'error', provider: 'google_drive', message: 'token_error' });
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();

    // Find or create the center's root folder in Drive (drive.file scope: we
    // can only see/manage files this app created, so we always search first
    // to stay idempotent across reconnects).
    const folderName = center.name || 'Psycma';
    let rootFolderId: string | null = null;

    const searchQuery = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      if (searchResult.files?.length > 0) rootFolderId = searchResult.files[0].id;
    }

    if (!rootFolderId) {
      const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
      });
      if (createResponse.ok) {
        const folder = await createResponse.json();
        rootFolderId = folder.id;
      } else {
        console.error('[google-drive-oauth-callback] Folder creation error:', await createResponse.text());
      }
    }

    if (!rootFolderId) {
      return redirect({ oauth: 'error', provider: 'google_drive', message: 'folder_error' });
    }

    const { data: existing } = await supabase
      .from('center_drive_connections')
      .select('refresh_token_encrypted')
      .eq('center_id', center_id)
      .maybeSingle();

    const upsertData: Record<string, unknown> = {
      center_id,
      connected_by: professional_id || null,
      google_account_email: userInfo.email || null,
      access_token_encrypted: await encryptSecret(tokenData.access_token),
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      drive_root_folder_id: rootFolderId,
      enabled: true,
      needs_reconnect: false,
      updated_at: new Date().toISOString(),
    };

    if (tokenData.refresh_token) {
      upsertData.refresh_token_encrypted = await encryptSecret(tokenData.refresh_token);
    } else if (existing?.refresh_token_encrypted) {
      // Google only sends a refresh_token on first consent; preserve the
      // existing one on subsequent reconnects.
      upsertData.refresh_token_encrypted = existing.refresh_token_encrypted;
    } else {
      console.error('[google-drive-oauth-callback] No refresh_token received and none stored previously');
      return redirect({ oauth: 'error', provider: 'google_drive', message: 'no_refresh_token' });
    }

    const { error: upsertError } = await supabase
      .from('center_drive_connections')
      .upsert(upsertData, { onConflict: 'center_id' });

    if (upsertError) {
      console.error('[google-drive-oauth-callback] DB error:', upsertError);
      return redirect({ oauth: 'error', provider: 'google_drive', message: 'db_error' });
    }

    return redirect({ oauth: 'success', provider: 'google_drive' });
  } catch (error) {
    console.error('[google-drive-oauth-callback] Unexpected error:', error);
    return redirect({ oauth: 'error', provider: 'google_drive', message: 'unknown_error' });
  }
});
