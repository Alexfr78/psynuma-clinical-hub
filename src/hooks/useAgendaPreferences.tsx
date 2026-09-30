import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import {
  AgendaIndicatorKey,
  AgendaIndicatorVisibility,
  DEFAULT_INDICATOR_VISIBILITY,
  mergeIndicatorVisibility,
  parseIndicatorVisibility,
} from '@/lib/agenda-indicators';
import type { Json } from '@/integrations/supabase/types';

/**
 * Selección de indicadores visibles en las tarjetas de la agenda, guardada en
 * el perfil del usuario. El cambio se aplica al instante y se persiste en
 * segundo plano; si falla, se revierte.
 */
export function useAgendaIndicatorPreferences() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const storedPreferences = profile?.agenda_preferences;
  const [visibility, setVisibility] = useState<AgendaIndicatorVisibility>(() =>
    parseIndicatorVisibility(storedPreferences),
  );

  useEffect(() => {
    setVisibility(parseIndicatorVisibility(storedPreferences));
  }, [storedPreferences]);

  const save = useCallback(async (next: AgendaIndicatorVisibility) => {
    if (!profile?.id) return;
    const previous = visibility;
    setVisibility(next);
    const { error } = await supabase
      .from('profiles')
      .update({ agenda_preferences: mergeIndicatorVisibility(storedPreferences, next) as Json })
      .eq('id', profile.id);
    if (error) {
      setVisibility(previous);
      toast({
        title: 'No se pudo guardar la selección de iconos',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    await refreshProfile();
  }, [profile?.id, storedPreferences, visibility, refreshProfile, toast]);

  const setIndicator = useCallback(
    (key: AgendaIndicatorKey, visible: boolean) => save({ ...visibility, [key]: visible }),
    [save, visibility],
  );

  const resetIndicators = useCallback(() => save({ ...DEFAULT_INDICATOR_VISIBILITY }), [save]);

  return { visibility, setIndicator, resetIndicators };
}

const AgendaIndicatorsContext = createContext<AgendaIndicatorVisibility>(DEFAULT_INDICATOR_VISIBILITY);

export const AgendaIndicatorsProvider = AgendaIndicatorsContext.Provider;

/** Indicadores visibles para las tarjetas. Fuera de la agenda usa los valores por defecto. */
export function useVisibleIndicators() {
  return useContext(AgendaIndicatorsContext);
}
