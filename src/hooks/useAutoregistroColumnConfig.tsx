import { useState, useCallback, useEffect } from 'react';

/**
 * Persists column visibility configuration per therapist + patient + template.
 * Uses localStorage with a structured key.
 *
 * Config stored: { visibleLabels: string[], columnOrder: string[] }
 */

interface ColumnConfig {
  visibleLabels: string[];
  columnOrder: string[];
}

function buildKey(professionalId: string, patientId: string, templateId: string): string {
  return `areg-cols:${professionalId}:${patientId}:${templateId}`;
}

function loadConfig(key: string): ColumnConfig | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.visibleLabels)) return parsed as ColumnConfig;
    return null;
  } catch {
    return null;
  }
}

function saveConfig(key: string, config: ColumnConfig): void {
  try {
    localStorage.setItem(key, JSON.stringify(config));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function clearConfig(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function useAutoregistroColumnConfig(
  professionalId: string | undefined,
  patientId: string | undefined,
  templateId: string | undefined,
) {
  const key = professionalId && patientId && templateId
    ? buildKey(professionalId, patientId, templateId)
    : null;

  const [config, setConfigState] = useState<ColumnConfig | null>(() => {
    if (!key) return null;
    return loadConfig(key);
  });

  // Reload when key changes
  useEffect(() => {
    if (!key) {
      setConfigState(null);
      return;
    }
    setConfigState(loadConfig(key));
  }, [key]);

  const setConfig = useCallback(
    (newConfig: ColumnConfig) => {
      setConfigState(newConfig);
      if (key) saveConfig(key, newConfig);
    },
    [key],
  );

  const resetConfig = useCallback(() => {
    setConfigState(null);
    if (key) clearConfig(key);
  }, [key]);

  const toggleColumn = useCallback(
    (label: string, visible: boolean) => {
      setConfigState((prev) => {
        const currentLabels = prev?.visibleLabels ?? [];
        const currentOrder = prev?.columnOrder ?? [];
        let newLabels: string[];
        if (visible) {
          newLabels = currentLabels.includes(label) ? currentLabels : [...currentLabels, label];
        } else {
          newLabels = currentLabels.filter((l) => l !== label);
        }
        const newConfig: ColumnConfig = {
          visibleLabels: newLabels,
          columnOrder: currentOrder.length > 0 ? currentOrder : newLabels,
        };
        if (key) saveConfig(key, newConfig);
        return newConfig;
      });
    },
    [key],
  );

  const reorderColumns = useCallback(
    (newOrder: string[]) => {
      setConfigState((prev) => {
        const newConfig: ColumnConfig = {
          visibleLabels: prev?.visibleLabels ?? newOrder,
          columnOrder: newOrder,
        };
        if (key) saveConfig(key, newConfig);
        return newConfig;
      });
    },
    [key],
  );

  return {
    /** Persisted config, null if using defaults */
    config,
    /** Visible column labels, null if using defaults */
    visibleLabels: config?.visibleLabels ?? null,
    /** Column order, null if using defaults */
    columnOrder: config?.columnOrder ?? null,
    /** Set full config */
    setConfig,
    /** Reset to defaults (removes stored config) */
    resetConfig,
    /** Toggle a single column */
    toggleColumn,
    /** Reorder columns */
    reorderColumns,
    /** Whether a custom config exists */
    hasCustomConfig: config !== null,
  };
}
