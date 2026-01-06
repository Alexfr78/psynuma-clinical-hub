/**
 * Types for Recurring Appointments System
 */

import { RecurrenceConfig, RecurrenceFrequency, RecurrenceEndType } from '@/lib/recurrence-utils';

export type { RecurrenceConfig, RecurrenceFrequency, RecurrenceEndType };

export interface RecurringSeries {
  id: string;
  center_id: string;
  created_by: string;
  patient_id: string;
  professional_id: string;
  base_start_datetime: string;
  duration_minutes: number;
  timezone: string;
  session_type: string | null;
  price: number;
  session_modality: string;
  location_id: string | null;
  cancellation_policy: string;
  notes_default: string | null;
  bono_id: string | null;
  rrule_json: RecurrenceConfig;
  max_occurrences: number;
  last_generated_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecurringSeriesInsert {
  center_id: string;
  created_by: string;
  patient_id: string;
  professional_id: string;
  base_start_datetime: string;
  duration_minutes: number;
  timezone?: string;
  session_type?: string | null;
  price?: number;
  session_modality?: string;
  location_id?: string | null;
  cancellation_policy?: string;
  notes_default?: string | null;
  bono_id?: string | null;
  rrule_json: RecurrenceConfig;
  max_occurrences?: number;
}

export interface RecurringSeriesUpdate {
  session_type?: string | null;
  price?: number;
  session_modality?: string;
  location_id?: string | null;
  notes_default?: string | null;
  bono_id?: string | null;
  rrule_json?: RecurrenceConfig;
  is_active?: boolean;
  last_generated_until?: string | null;
}

export type EditScope = 'this' | 'this_and_following' | 'all';

export interface RecurringSessionData {
  recurring_series_id: string | null;
  occurrence_index: number | null;
  is_exception: boolean;
  original_start_datetime: string | null;
}
