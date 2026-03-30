import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';

function normalizeSelectOptions(options?: string[]): string[] {
  return (options ?? [])
    .map((option) => option?.trim())
    .filter((option): option is string => Boolean(option));
}

function normalizeScaleConfig(field: AutoregistroField): Partial<AutoregistroField> {
  let min = Number.isFinite(field.min) ? field.min! : 0;
  let max = Number.isFinite(field.max) ? field.max! : 10;
  if (min >= max) { min = 0; max = 10; }

  let step = Number.isFinite(field.step) && field.step! > 0 ? field.step! : 1;

  let defaultValue = Number.isFinite(field.defaultValue) ? field.defaultValue! : Math.round((min + max) / 2);
  if (defaultValue < min) defaultValue = min;
  if (defaultValue > max) defaultValue = max;

  return { min, max, step, defaultValue };
}

export function normalizeAutoregistroField(
  field: AutoregistroField,
  index: number
): AutoregistroField {
  const normalizedBase: AutoregistroField = {
    ...field,
    label: field.label ?? '',
    required: Boolean(field.required),
    order: Number.isFinite(field.order) ? field.order : index,
  };

  if (normalizedBase.type === 'select') {
    return {
      ...normalizedBase,
      options: normalizeSelectOptions(normalizedBase.options),
    };
  }

  if (normalizedBase.type === 'scale') {
    const scaleConfig = normalizeScaleConfig(normalizedBase);
    const { options, ...fieldWithoutOptions } = normalizedBase;
    return { ...fieldWithoutOptions, ...scaleConfig } as AutoregistroField;
  }

  const { options, ...fieldWithoutOptions } = normalizedBase;
  return fieldWithoutOptions as AutoregistroField;
}

export function normalizeAutoregistroFields(fields: AutoregistroField[] | null | undefined): AutoregistroField[] {
  return (fields ?? []).map((field, index) => normalizeAutoregistroField(field, index));
}

/** Safe accessors for scale config with backwards-compatible defaults */
export function getScaleMin(field: AutoregistroField): number {
  return Number.isFinite(field.min) ? field.min! : 0;
}
export function getScaleMax(field: AutoregistroField): number {
  return Number.isFinite(field.max) ? field.max! : 10;
}
export function getScaleStep(field: AutoregistroField): number {
  return Number.isFinite(field.step) && field.step! > 0 ? field.step! : 1;
}
export function getScaleDefault(field: AutoregistroField): number {
  const min = getScaleMin(field);
  const max = getScaleMax(field);
  const def = Number.isFinite(field.defaultValue) ? field.defaultValue! : Math.round((min + max) / 2);
  return Math.max(min, Math.min(max, def));
}
