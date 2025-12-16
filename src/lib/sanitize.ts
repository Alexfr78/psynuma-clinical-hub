import DOMPurify from 'dompurify';

// Sanitize configuration for consent templates and document content
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'strong', 'em', 'u', 'br', 'mark',
    'font', 'b', 'i', 'table', 'tr', 'td', 'th', 'tbody', 'thead'
  ],
  ALLOWED_ATTR: ['style', 'class', 'size'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
};

/**
 * Sanitize HTML content to prevent XSS attacks
 * Used for consent templates and document content
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

/**
 * Sanitize HTML for preview display (same config)
 */
export function sanitizePreview(html: string): string {
  return DOMPurify.sanitize(html, {
    ...SANITIZE_CONFIG,
    // Also allow mark tags for highlighting variables in preview
    ALLOWED_TAGS: [...SANITIZE_CONFIG.ALLOWED_TAGS, 'mark'],
  });
}
