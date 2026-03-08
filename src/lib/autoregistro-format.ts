import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';

export function formatFieldValue(field: AutoregistroField, value: any): string {
  if (value === undefined || value === null) return '—';
  if (field.type === 'checkbox') return value ? 'Sí' : 'No';
  if (field.type === 'scale') return `${value}/10`;
  return String(value);
}
