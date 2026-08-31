/**
 * Field Display Metadata System for Autoregistros
 *
 * Provides a robust mapping between template fields and their clinical
 * presentation in the "Registros" tab. Each field gets display metadata
 * that controls how it renders in tables, cards, detail views, and charts.
 *
 * Visibility levels:
 * - 'system'   : Always visible, cannot be hidden (date, time, alerts, actions)
 * - 'primary'  : Visible by default, clinically important
 * - 'secondary': Hidden by default, can be shown via column selector
 * - 'detail'   : Only shown in the detail drawer, never in table/cards
 */

import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';
import { getScaleMax, getScaleMin } from './autoregistro-fields';

export type FieldVisibility = 'system' | 'primary' | 'secondary' | 'detail';

export type FieldDisplayType =
  | 'text-short'
  | 'text-long'
  | 'number'
  | 'scale'
  | 'emotion'
  | 'boolean'
  | 'date'
  | 'time'
  | 'select'
  | 'badge';

export interface FieldDisplayMeta {
  /** Original field from the template */
  field: AutoregistroField;
  /** Short label for table header (falls back to field.label) */
  shortLabel: string;
  /** Display type that drives rendering logic */
  displayType: FieldDisplayType;
  /** Visibility level */
  visibility: FieldVisibility;
  /** Default visible in table/cards (derived from visibility) */
  defaultVisible: boolean;
  /** Only show in detail view, never in table */
  detailOnly: boolean;
  /** Clinical priority (lower = more important, used for default sort) */
  priority: number;
  /** Can be charted */
  chartable: boolean;
  /** Can be used for comparison */
  comparable: boolean;
}

/** Map a template field type to a display type */
function resolveDisplayType(field: AutoregistroField): FieldDisplayType {
  switch (field.type) {
    case 'text': return 'text-short';
    case 'textarea': return 'text-long';
    case 'number': return 'number';
    case 'scale': return 'scale';
    case 'emotion_cards': return 'emotion';
    case 'checkbox': return 'boolean';
    case 'date': return 'date';
    case 'time': return 'time';
    case 'select': return 'select';
    default: return 'text-short';
  }
}

/** Infer visibility from field type and characteristics */
function resolveVisibility(field: AutoregistroField, index: number): FieldVisibility {
  // Textareas are long — detail only by default
  if (field.type === 'textarea') return 'detail';
  // First 6 fields are primary, rest are secondary
  if (index < 6) return 'primary';
  return 'secondary';
}

/** Derive priority: scales/numbers first, then selects/emotions, then text */
function resolvePriority(field: AutoregistroField, index: number): number {
  const typeWeights: Record<string, number> = {
    scale: 0,
    number: 1,
    emotion_cards: 2,
    select: 3,
    checkbox: 4,
    date: 5,
    time: 6,
    text: 7,
    textarea: 8,
  };
  const typeWeight = typeWeights[field.type] ?? 7;
  return typeWeight * 100 + index;
}

/** Generate a short label for table headers */
function resolveShortLabel(field: AutoregistroField): string {
  const label = field.label.trim();
  // If label is short enough, use as-is
  if (label.length <= 20) return label;
  // Remove common parenthetical ranges like "(0-10)"
  const cleaned = label.replace(/\s*\(\d+[-–]\d+\)\s*$/, '').trim();
  if (cleaned.length <= 20) return cleaned;
  // Truncate
  return cleaned.substring(0, 18) + '…';
}

/**
 * Build display metadata for all fields in a template.
 * Sorts fields by their `order` property first.
 */
export function buildFieldDisplayMetas(fields: AutoregistroField[]): FieldDisplayMeta[] {
  const sorted = [...fields].sort((a, b) => a.order - b.order);

  return sorted.map((field, index) => {
    const displayType = resolveDisplayType(field);
    const visibility = resolveVisibility(field, index);

    return {
      field,
      shortLabel: resolveShortLabel(field),
      displayType,
      visibility,
      defaultVisible: visibility === 'system' || visibility === 'primary',
      detailOnly: visibility === 'detail',
      priority: resolvePriority(field, index),
      chartable: field.type === 'number' || field.type === 'scale',
      comparable: field.type !== 'textarea',
    };
  });
}

/**
 * Get which fields should be visible based on current column config.
 * If no config exists, returns default visible fields.
 */
export function getVisibleFields(
  metas: FieldDisplayMeta[],
  visibleLabels?: string[] | null,
): FieldDisplayMeta[] {
  if (!visibleLabels) {
    return metas.filter((m) => m.defaultVisible);
  }
  const labelSet = new Set(visibleLabels);
  return metas.filter((m) => m.visibility === 'system' || labelSet.has(m.field.label));
}

/**
 * Format a field value for table/card display.
 * Returns a structured result for richer rendering.
 */
export interface FormattedFieldValue {
  text: string;
  type: FieldDisplayType;
  /** For scale: fraction out of max */
  scaleMax?: number;
  scaleMin?: number;
  numericValue?: number;
  /** Whether the text is truncated */
  truncated: boolean;
  /** Raw value for comparisons */
  raw: unknown;
}

export function formatFieldForDisplay(
  meta: FieldDisplayMeta,
  value: unknown,
  maxTextLength = 60,
): FormattedFieldValue {
  const { field, displayType } = meta;

  if (value === undefined || value === null || value === '') {
    return { text: '—', type: displayType, truncated: false, raw: value };
  }

  switch (displayType) {
    case 'boolean':
      return { text: value ? 'Sí' : 'No', type: displayType, truncated: false, raw: value };

    case 'scale': {
      const num = Number(value);
      return {
        text: `${num} / ${getScaleMax(field)}`,
        type: displayType,
        scaleMax: getScaleMax(field),
        scaleMin: getScaleMin(field),
        numericValue: num,
        truncated: false,
        raw: value,
      };
    }

    case 'number':
      return {
        text: String(value),
        type: displayType,
        numericValue: Number(value),
        truncated: false,
        raw: value,
      };

    case 'emotion':
      return { text: String(value), type: displayType, truncated: false, raw: value };

    case 'date':
      return { text: String(value), type: displayType, truncated: false, raw: value };

    case 'time':
      return { text: String(value), type: displayType, truncated: false, raw: value };

    case 'text-long': {
      const str = String(value);
      const truncated = str.length > maxTextLength;
      return {
        text: truncated ? str.substring(0, maxTextLength) + '…' : str,
        type: displayType,
        truncated,
        raw: value,
      };
    }

    case 'select':
      return { text: String(value), type: displayType, truncated: false, raw: value };

    default: {
      const str = String(value);
      const truncated = str.length > maxTextLength;
      return {
        text: truncated ? str.substring(0, maxTextLength) + '…' : str,
        type: displayType,
        truncated,
        raw: value,
      };
    }
  }
}

/**
 * Detect clinical alerts in entries:
 * - Extreme values (scale at min or max)
 * - Trends (3+ consecutive increases/decreases in scale/number fields)
 * - Missing entries (gap > 7 days between most recent and now)
 */
export interface ClinicalAlert {
  type: 'extreme_value' | 'trend_worsening' | 'trend_improving' | 'gap_detected' | 'rule_alert';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  fieldLabel?: string;
}

export function detectClinicalAlerts(
  entries: Array<{ values: Record<string, unknown>; submitted_at: string; alertSeverity?: string | null }>,
  metas: FieldDisplayMeta[],
): ClinicalAlert[] {
  const alerts: ClinicalAlert[] = [];
  if (entries.length === 0) return alerts;

  const sorted = [...entries].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
  );

  // 1. Gap detection
  const lastDate = new Date(sorted[0].submitted_at);
  const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 7) {
    alerts.push({
      type: 'gap_detected',
      severity: daysSince > 14 ? 'warning' : 'info',
      message: `Sin registros desde hace ${Math.floor(daysSince)} días`,
    });
  }

  // 2. Rule-based alerts from entries
  const hasRuleAlerts = sorted.some((e) => e.alertSeverity);
  if (hasRuleAlerts) {
    const criticalCount = sorted.filter((e) => e.alertSeverity === 'critical').length;
    const warningCount = sorted.filter((e) => e.alertSeverity === 'warning').length;
    if (criticalCount > 0) {
      alerts.push({
        type: 'rule_alert',
        severity: 'critical',
        message: `${criticalCount} registro(s) con alerta crítica`,
      });
    }
    if (warningCount > 0) {
      alerts.push({
        type: 'rule_alert',
        severity: 'warning',
        message: `${warningCount} registro(s) con alerta de aviso`,
      });
    }
  }

  // 3. Extreme values in most recent entry and trends
  const scaleMetas = metas.filter((m) => m.displayType === 'scale');
  for (const meta of scaleMetas) {
    const label = meta.field.label;
    const latest = sorted[0].values[label];
    if (latest === undefined || latest === null) continue;
    const num = Number(latest);
    const max = getScaleMax(meta.field);
    const min = getScaleMin(meta.field);

    if (num >= max) {
      alerts.push({
        type: 'extreme_value',
        severity: 'warning',
        message: `"${meta.shortLabel}" al máximo (${num}/${max})`,
        fieldLabel: label,
      });
    } else if (num <= min) {
      alerts.push({
        type: 'extreme_value',
        severity: 'info',
        message: `"${meta.shortLabel}" al mínimo (${num}/${max})`,
        fieldLabel: label,
      });
    }

    // Trend detection: 3+ consecutive increases or decreases
    if (sorted.length >= 3) {
      const recent = sorted.slice(0, 5).map((e) => Number(e.values[label])).filter((n) => !isNaN(n));
      if (recent.length >= 3) {
        const allIncreasing = recent.every((v, i) => i === 0 || v >= recent[i - 1]);
        const allDecreasing = recent.every((v, i) => i === 0 || v <= recent[i - 1]);
        // recent[0] is most recent, so "increasing" means going up over time = values are decreasing in array
        if (allDecreasing && recent[0] > recent[recent.length - 1]) {
          alerts.push({
            type: 'trend_worsening',
            severity: 'info',
            message: `"${meta.shortLabel}" en tendencia ascendente`,
            fieldLabel: label,
          });
        }
        if (allIncreasing && recent[0] < recent[recent.length - 1]) {
          alerts.push({
            type: 'trend_improving',
            severity: 'info',
            message: `"${meta.shortLabel}" en tendencia descendente`,
            fieldLabel: label,
          });
        }
      }
    }
  }

  return alerts;
}
