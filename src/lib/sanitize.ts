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

const SAFE_STYLE_PROPS = [
  'color', 'background-color', 'font-weight', 'font-style',
  'text-decoration', 'text-align', 'font-size', 'margin', 'padding',
];

if (typeof window !== 'undefined') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.hasAttribute('style')) {
      const raw = node.getAttribute('style') || '';
      const clean = raw
        .split(';')
        .map((r) => r.trim())
        .filter((r) =>
          SAFE_STYLE_PROPS.some((p) => r.toLowerCase().startsWith(p))
        )
        .join('; ');
      if (clean) {
        node.setAttribute('style', clean);
      } else {
        node.removeAttribute('style');
      }
    }
  });
}

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
