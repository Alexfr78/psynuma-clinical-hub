/**
 * Generate a WhatsApp Web link with a pre-filled message
 * @param phone - Phone number (will be cleaned to digits only)
 * @param message - Message to pre-fill
 * @returns WhatsApp Web URL
 */
export function generateWhatsAppWebLink(phone: string, message: string): string {
  // Clean phone number: remove all non-digit characters
  // If doesn't start with country code, assume Spain (+34)
  let cleanPhone = phone.replace(/\D/g, '');
  
  // If the number is 9 digits and starts with 6 or 7, add Spanish country code
  if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
    cleanPhone = '34' + cleanPhone;
  }
  
  // Encode message for URL
  const encodedMessage = encodeURIComponent(message);
  
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
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
