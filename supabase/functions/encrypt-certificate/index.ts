import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Convert Uint8Array to base64
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// AES-256-GCM encryption
async function encryptAES256GCM(plaintext: string, keyHex: string): Promise<string> {
  // Convert key from hex to bytes
  const keyBytes = hexToBytes(keyHex);
  
  // Import key for AES-GCM
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // Generate random 12-byte IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encode plaintext to bytes
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  
  // Encrypt with AES-GCM (includes 16-byte auth tag at the end)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv, tagLength: 128 },
    key,
    plaintextBytes
  );
  
  // Combine IV + ciphertext (which includes auth tag)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  // Return as base64
  return bytesToBase64(combined);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
    if (!encryptionKey) {
      console.error('CERTIFICATE_ENCRYPTION_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Encryption key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate key is 64 hex chars (32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
      console.error('CERTIFICATE_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
      return new Response(
        JSON.stringify({ error: 'Invalid encryption key format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { certificate_base64, password } = await req.json();

    if (!certificate_base64 || !password) {
      return new Response(
        JSON.stringify({ error: 'certificate_base64 and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Encrypting certificate data...');

    // Encrypt both values
    const encrypted_certificate = await encryptAES256GCM(certificate_base64, encryptionKey);
    const encrypted_password = await encryptAES256GCM(password, encryptionKey);

    console.log('Certificate data encrypted successfully');

    return new Response(
      JSON.stringify({ 
        encrypted_certificate,
        encrypted_password,
        // Add a prefix to identify encrypted data
        format: 'AES-256-GCM'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Encryption error:', error);
    const message = error instanceof Error ? error.message : 'Encryption failed';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
