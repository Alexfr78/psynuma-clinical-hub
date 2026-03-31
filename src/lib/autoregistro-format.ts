import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';
import { getScaleMax } from './autoregistro-fields';

export function formatFieldValue(field: AutoregistroField, value: any): string {
  if (value === undefined || value === null) return '—';
  if (field.type === 'checkbox') return value ? 'Sí' : 'No';
  if (field.type === 'scale') return `${value}/${getScaleMax(field)}`;
  if (field.type === 'emotion_cards') return String(value);
  return String(value);
}
