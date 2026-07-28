import { useCallback, useEffect, useState } from 'react';

import { ApiClientError } from '@/services/apiClient';
import { settingsService } from '@/services/settingsService';
import type { UserSettings } from '@/types';

interface UseUserSettings {
  settings: UserSettings | null;
  isLoading: boolean;
  error: string | null;
  /** Key currently being persisted, so its control can show a pending state. */
  savingKey: keyof UserSettings | null;
  /** Flip one toggle and persist it. Optimistic; reverts on failure. */
  setToggle: (key: keyof UserSettings, value: boolean) => void;
}

function messageFrom(err: unknown): string {
  if (err instanceof ApiClientError) return err.payload.message;
  return err instanceof Error ? err.message : 'Une erreur est survenue.';
}

/**
 * Load and edit the signed-in user's settings.
 *
 * Each toggle persists on change (`PATCH /settings` with the single field) and is
 * applied optimistically — the switch moves at once and reverts if the request
 * fails, so a settings page never needs a separate "Save" button.
 */
export function useUserSettings(): UseUserSettings {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<keyof UserSettings | null>(null);

  useEffect(() => {
    let active = true;
    settingsService
      .get()
      .then((data) => active && setSettings(data))
      .catch((err) => active && setError(messageFrom(err)))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const setToggle = useCallback(
    (key: keyof UserSettings, value: boolean) => {
      setSettings((current) => (current ? { ...current, [key]: value } : current));
      setSavingKey(key);
      setError(null);
      settingsService
        .update({ [key]: value })
        .then((updated) => setSettings(updated))
        .catch((err) => {
          // Revert the optimistic flip and surface why.
          setSettings((current) => (current ? { ...current, [key]: !value } : current));
          setError(messageFrom(err));
        })
        .finally(() => setSavingKey((k) => (k === key ? null : k)));
    },
    [],
  );

  return { settings, isLoading, error, savingKey, setToggle };
}
