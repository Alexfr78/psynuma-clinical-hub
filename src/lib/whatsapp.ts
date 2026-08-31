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
 * Detect if the current device is mobile (Android/iOS)
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';
  return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
}

/**
 * Detect if the current device is iOS
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(userAgent.toLowerCase());
}

/**
 * Detect if the current device is Android
 */
export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  return /android/i.test(userAgent.toLowerCase());
}

export type WhatsAppOpenResult = {
  method: 'native' | 'universal' | 'web';
  success: boolean;
  fallback?: boolean;
};

/**
 * Smart WhatsApp opening logic
 * - On mobile: tries native protocol first, falls back to universal link
 * - On desktop: opens universal link, with web.whatsapp.com as fallback
 * 
 * @param phone - Phone number
 * @param message - Pre-filled message
 * @param preferredMethod - Force a specific method (optional)
 * @returns Promise with result information
 */
export async function openWhatsAppSmart(
  phone: string,
  message: string,
  preferredMethod?: 'native' | 'universal' | 'web'
): Promise<WhatsAppOpenResult> {
  const universalLink = generateWhatsAppUniversalLink(phone, message);
  const webLink = generateWhatsAppWebLink(phone, message);
  const nativeLink = generateWhatsAppNativeLink(phone, message);

  // If a specific method is requested, use it directly
  if (preferredMethod === 'web') {
    window.open(webLink, '_blank');
    return { method: 'web', success: true };
  }
  
  if (preferredMethod === 'universal') {
    window.open(universalLink, '_blank');
    return { method: 'universal', success: true };
  }
  
  if (preferredMethod === 'native') {
    window.location.href = nativeLink;
    return { method: 'native', success: true };
  }

  // Smart detection based on device
  if (isMobileDevice()) {
    // On mobile, try native protocol first
    // Use visibility change detection to see if app opened
    return new Promise((resolve) => {
      const startTime = Date.now();
      let appOpened = false;
      
      const handleVisibilityChange = () => {
        if (document.hidden) {
          appOpened = true;
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Try to open native app
      window.location.href = nativeLink;
      
      // Wait and check if app opened
      setTimeout(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        
        if (!appOpened && Date.now() - startTime < 1000) {
          // App didn't open, fall back to universal link
          window.location.href = universalLink;
          resolve({ method: 'universal', success: true, fallback: true });
        } else {
          resolve({ method: 'native', success: true });
        }
      }, 800);
    });
  } else {
    // On desktop, open universal link in new tab
    window.open(universalLink, '_blank');
    return { method: 'universal', success: true };
  }
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
