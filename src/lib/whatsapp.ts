/**
 * Clean and format phone number for WhatsApp
 */
function cleanPhoneNumber(phone: string): string {
  let cleanPhone = phone.replace(/\D/g, '');
  // If the number is 9 digits and starts with 6 or 7, add Spanish country code
  if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
    cleanPhone = '34' + cleanPhone;
  }
  return cleanPhone;
}

/**
 * Generate a WhatsApp Web link with a pre-filled message
 * Opens WhatsApp Web directly in the browser
 */
export function generateWhatsAppWebLink(phone: string, message: string): string {
  const cleanPhone = cleanPhoneNumber(phone);
  const encodedMessage = encodeURIComponent(message);
  return `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
}

/**
 * Generate a WhatsApp Universal link (wa.me) - Official format
 * Works on both mobile and desktop, redirects to app or web
 */
export function generateWhatsAppUniversalLink(phone: string, message: string): string {
  const cleanPhone = cleanPhoneNumber(phone);
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

/**
 * Generate a WhatsApp native protocol link
 * Opens WhatsApp app directly if installed
 */
export function generateWhatsAppNativeLink(phone: string, message: string): string {
  const cleanPhone = cleanPhoneNumber(phone);
  const encodedMessage = encodeURIComponent(message);
  return `whatsapp://send?phone=${cleanPhone}&text=${encodedMessage}`;
}

/**
 * Format phone number for display
 * @param phone - Raw phone number
 * @returns Formatted phone string
 */
export function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length === 9) {
    // Spanish format: XXX XX XX XX
    return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  }
  
  if (digits.length === 11 && digits.startsWith('34')) {
    // Spanish with country code: +34 XXX XX XX XX
    return `+34 ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  
  return phone;
}

export type WhatsAppSendMethod = 'web' | 'api';

export interface WhatsAppConfig {
  sendMethod: WhatsAppSendMethod;
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
}
