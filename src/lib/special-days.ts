export type SpecialDayScope = 'center' | 'professional';
export type SpecialDayType = 'closed' | 'custom' | 'extended';

export interface SpecialDaySlot {
  id?: string;
  special_day_id?: string;
  start_time: string; // HH:MM or HH:MM:SS
  end_time: string;
}

export interface SpecialDay {
  id: string;
  center_id: string;
  professional_id: string | null;
  scope: SpecialDayScope;
  type: SpecialDayType;
  start_date: string; // yyyy-MM-dd
  end_date: string;
  label: string | null;
  notes: string | null;
  affects_public_booking: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  special_day_slots?: SpecialDaySlot[];
}

export const SPECIAL_DAY_TYPE_LABELS: Record<SpecialDayType, string> = {
  closed: 'Cerrado',
  custom: 'Horario personalizado',
  extended: 'Horario ampliado',
};

export const SPECIAL_DAY_TYPE_DESCRIPTIONS: Record<SpecialDayType, string> = {
  closed: 'El día queda cerrado (no se agendan citas).',
  custom: 'Reemplaza el horario semanal por los tramos indicados.',
  extended: 'Añade los tramos indicados al horario semanal habitual.',
};

export function getSpecialDayTypeLabel(type: SpecialDayType): string {
  return SPECIAL_DAY_TYPE_LABELS[type] ?? type;
}

export function getSpecialDayErrorMessage(err: unknown, fallback: string): string {
  const raw =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : '';

  if (raw.includes('special_days_no_overlap_center')) {
    return 'Ya existe otro día especial del centro que se solapa con ese rango de fechas. Edita el existente o cambia el alcance.';
  }
  if (raw.includes('special_days_no_overlap_professional')) {
    return 'Ya existe otro día especial de este profesional que se solapa con ese rango de fechas. Edita el existente o elige otro rango.';
  }
  return raw || fallback;
}
