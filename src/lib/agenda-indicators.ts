/**
 * Indicadores que puede mostrar una tarjeta de cita en la agenda y qué
 * selección ha hecho cada usuario. La selección se guarda en
 * `profiles.agenda_preferences.indicators` (ver useAgendaPreferences).
 */

export type AgendaIndicatorKey =
  | 'recurring'
  | 'cancellation_policy'
  | 'payment'
  | 'modality'
  | 'couple'
  | 'notes'
  | 'reminder'
  | 'google_sync'
  | 'professional'
  | 'price';

export interface AgendaIndicatorDefinition {
  key: AgendaIndicatorKey;
  label: string;
  /** Icono de Material Symbols para el selector y la leyenda. */
  icon: string;
  description: string;
  defaultVisible: boolean;
  /** Solo se ve en la tarjeta completa (vistas Día y Lista). */
  fullCardOnly?: boolean;
}

export const AGENDA_INDICATORS: AgendaIndicatorDefinition[] = [
  { key: 'payment', label: 'Pago', icon: 'check_circle', description: 'Pagado, pendiente o reembolsado', defaultVisible: true },
  { key: 'cancellation_policy', label: 'Política de cancelación', icon: 'task', description: 'Firmada, pendiente o sin firmar', defaultVisible: true },
  { key: 'recurring', label: 'Recurrente', icon: 'refresh', description: 'La cita forma parte de una serie', defaultVisible: true },
  { key: 'modality', label: 'Online', icon: 'videocam', description: 'Zoom, Google Meet o enlace propio', defaultVisible: false },
  { key: 'couple', label: 'Sesión de pareja', icon: 'group', description: 'Cita con dos contactos', defaultVisible: false },
  { key: 'notes', label: 'Notas', icon: 'sticky_note_2', description: 'La cita tiene notas', defaultVisible: false },
  { key: 'reminder', label: 'Recordatorio enviado', icon: 'notifications_active', description: 'Ya se envió el recordatorio', defaultVisible: false },
  { key: 'google_sync', label: 'En Google Calendar', icon: 'event_available', description: 'Sincronizada con Google Calendar', defaultVisible: false },
  { key: 'professional', label: 'Profesional', icon: 'person', description: 'Nombre del profesional', defaultVisible: true, fullCardOnly: true },
  { key: 'price', label: 'Precio', icon: 'euro', description: 'Importe de la cita', defaultVisible: true, fullCardOnly: true },
];

export type AgendaIndicatorVisibility = Record<AgendaIndicatorKey, boolean>;

export const DEFAULT_INDICATOR_VISIBILITY: AgendaIndicatorVisibility = AGENDA_INDICATORS.reduce(
  (acc, item) => ({ ...acc, [item.key]: item.defaultVisible }),
  {} as AgendaIndicatorVisibility,
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Lee la selección guardada. Tolera datos corruptos o claves desconocidas:
 * lo que no sea un booleano válido cae al valor por defecto.
 */
export function parseIndicatorVisibility(agendaPreferences: unknown): AgendaIndicatorVisibility {
  const stored = isRecord(agendaPreferences) && isRecord(agendaPreferences.indicators)
    ? agendaPreferences.indicators
    : {};
  const result = { ...DEFAULT_INDICATOR_VISIBILITY };
  for (const item of AGENDA_INDICATORS) {
    const value = stored[item.key];
    if (typeof value === 'boolean') result[item.key] = value;
  }
  return result;
}

/** Devuelve las preferencias con la nueva selección, conservando otras claves. */
export function mergeIndicatorVisibility(
  agendaPreferences: unknown,
  visibility: AgendaIndicatorVisibility,
): Record<string, unknown> {
  const base = isRecord(agendaPreferences) ? agendaPreferences : {};
  return { ...base, indicators: { ...visibility } };
}

export interface IndicatorSessionFields {
  recurring_series_id?: string | null;
  session_modality?: string | null;
  video_call_link?: string | null;
  notes?: string | null;
  reminder_sent_at?: string | null;
  google_calendar_event_id?: string | null;
  participants?: unknown[] | null;
}

/** Qué indicadores "booleanos" (sin estado propio) aplican a una cita. */
export function getSessionFlags(session: IndicatorSessionFields) {
  const modality = session.session_modality ?? null;
  return {
    recurring: !!session.recurring_series_id,
    online: (!!modality && modality !== 'in_person') || (!modality && !!session.video_call_link),
    couple: Array.isArray(session.participants) && session.participants.length > 0,
    // Los bloqueos importados de Google guardan su título en notes: no son notas.
    notes: !!session.notes?.trim() && !session.notes.startsWith('[Google Calendar]'),
    reminder: !!session.reminder_sent_at,
    googleSync: !!session.google_calendar_event_id,
  };
}

export const MODALITY_LABELS: Record<string, string> = {
  zoom: 'Online (Zoom)',
  google_meet: 'Online (Google Meet)',
  custom_link: 'Online (enlace)',
};
