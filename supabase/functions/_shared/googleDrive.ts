/**
 * Shared Google Drive API helpers (drive.file scope) used by
 * upload-invoice-to-drive and refresh-google-drive-tokens.
 */

export class DriveReconnectError extends Error {}

export async function refreshDriveAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('invalid_grant')) {
      throw new DriveReconnectError('Refresh token revoked or expired');
    }
    throw new Error(`Failed to refresh Drive token: ${errorText}`);
  }

  return await response.json();
}

export async function findOrCreateDriveFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const escapedName = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `name='${escapedName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchResponse.json();
  if (searchData.files?.length > 0) return searchData.files[0].id;

  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!createResponse.ok) {
    throw new Error(`Failed to create Drive folder "${name}": ${await createResponse.text()}`);
  }
  const created = await createResponse.json();
  return created.id;
}

export function sanitizeDriveFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 200);
}

export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  bytes: Uint8Array,
  mimeType = 'application/pdf'
): Promise<{ id: string }> {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadata = { name: fileName, parents: [folderId] };
  const metadataPart = new TextEncoder().encode(
    delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
    delimiter + `Content-Type: ${mimeType}\r\n\r\n`
  );
  const closePart = new TextEncoder().encode(closeDelim);

  const body = new Uint8Array(metadataPart.length + bytes.byteLength + closePart.length);
  body.set(metadataPart, 0);
  body.set(bytes, metadataPart.length);
  body.set(closePart, metadataPart.length + bytes.byteLength);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload to Drive: ${await response.text()}`);
  }
  return await response.json();
}
