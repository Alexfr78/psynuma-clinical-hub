import DOMPurify from 'dompurify';

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'div', 'span'],
  ALLOWED_ATTR: [] as string[],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
};

export function sanitizeDescription(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
