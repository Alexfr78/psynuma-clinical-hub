/**
 * Shared encryption/decryption utilities for sensitive data
 * Uses AES-256-GCM with CERTIFICATE_ENCRYPTION_KEY
 */

const ENCRYPTION_KEY_ENV = 'CERTIFICATE_ENCRYPTION_KEY';

/**
 * Get the encryption key from environment
 */
function getEncryptionKey(): string | null {
  return Deno.env.get(ENCRYPTION_KEY_ENV) || null;
}

/**
 * Encrypt a secret using AES-256-GCM
 * Returns base64 encoded string with IV prepended
 */
export async function encryptSecret(secret: string): Promise<string> {
  if (!secret) return '';
  
  const encryptionKey = getEncryptionKey();
  
  if (encryptionKey) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(encryptionKey.padEnd(32, '0').slice(0, 32));
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dataToEncrypt = encoder.encode(secret);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataToEncrypt
    );
    
    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } else {
    // Fallback - base64 encode (not secure, but works for development)
    console.warn('[crypto] No encryption key configured, using base64 encoding');
    return btoa(secret);
  }
}

/**
 * Decrypt a secret encrypted with encryptSecret
 * Expects base64 encoded string with IV prepended
 */
export async function decryptSecret(encryptedSecret: string): Promise<string> {
  if (!encryptedSecret) return '';
  
  const encryptionKey = getEncryptionKey();
  
  if (encryptionKey) {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(encryptionKey.padEnd(32, '0').slice(0, 32));
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      
      // Decode base64
      const combined = Uint8Array.from(atob(encryptedSecret), c => c.charCodeAt(0));
      
      // Extract IV (first 12 bytes) and ciphertext
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('[crypto] Decryption failed, token may be in plaintext:', error);
      // Try to return as-is in case it's a legacy plaintext token
      return encryptedSecret;
    }
  } else {
    // No encryption key - try base64 decode
    try {
      return atob(encryptedSecret);
    } catch {
      // Not base64 encoded, return as-is (legacy plaintext)
      return encryptedSecret;
    }
  }
}

/**
 * Check if a value appears to be encrypted (base64 with reasonable length)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  // Encrypted values should be base64 and at least 25 chars (12 IV + min content)
  try {
    const decoded = atob(value);
    return decoded.length >= 25;
  } catch {
    return false;
  }
}
