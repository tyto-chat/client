/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { usePreferenceSync } from "@/hooks/usePreferenceSync";
import { DEVICE_SETTINGS_SEEDED_EVENT } from "@/platform/deviceSettingsSeed";

interface TimezoneState {
  timezone: string;
  setTimezone: (tz: string) => void;
}

const TimezoneContext = createContext<TimezoneState | null>(null);

function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.TIMEZONE) ?? getBrowserTimezone(),
  );

  const { writeToServer } = usePreferenceSync("timezone", setTimezoneState);

  useEffect(() => {
    const reload = () =>
      setTimezoneState(localStorage.getItem(STORAGE_KEYS.TIMEZONE) ?? getBrowserTimezone());
    window.addEventListener(DEVICE_SETTINGS_SEEDED_EVENT, reload);
    return () => window.removeEventListener(DEVICE_SETTINGS_SEEDED_EVENT, reload);
  }, []);

  const setTimezone = useCallback(
    (tz: string) => {
      setTimezoneState(tz);
      localStorage.setItem(STORAGE_KEYS.TIMEZONE, tz);
      writeToServer(tz);
    },
    [writeToServer],
  );

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone(): TimezoneState {
  const ctx = useContext(TimezoneContext);
  if (!ctx) throw new Error("useTimezone must be used within TimezoneProvider");
  return ctx;
}
