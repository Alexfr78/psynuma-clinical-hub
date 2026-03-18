import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';

function normalizeSelectOptions(options?: string[]): string[] {
  return (options ?? [])
    .map((option) => option?.trim())
    .filter((option): option is string => Boolean(option));
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

  const { options, ...fieldWithoutOptions } = normalizedBase;
  return fieldWithoutOptions as AutoregistroField;
}

export function normalizeAutoregistroFields(fields: AutoregistroField[] | null | undefined): AutoregistroField[] {
  return (fields ?? []).map((field, index) => normalizeAutoregistroField(field, index));
}
