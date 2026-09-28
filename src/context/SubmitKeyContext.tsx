/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { usePreferenceSync } from "@/hooks/usePreferenceSync";
import { DEVICE_SETTINGS_SEEDED_EVENT } from "@/platform/deviceSettingsSeed";

export type SubmitKey = "enter" | "shift+enter" | "ctrl+enter" | "none";

interface SubmitKeyState {
  submitKey: SubmitKey;
  setSubmitKey: (key: SubmitKey) => void;
}

const SubmitKeyContext = createContext<SubmitKeyState | null>(null);

const DEFAULT: SubmitKey = "enter";

export function SubmitKeyProvider({ children }: { children: ReactNode }) {
  const [submitKey, setSubmitKeyState] = useState<SubmitKey>(
    () => (localStorage.getItem(STORAGE_KEYS.SUBMIT_KEY) as SubmitKey | null) ?? DEFAULT,
  );

  const { writeToServer } = usePreferenceSync("submitKey", setSubmitKeyState);

  useEffect(() => {
    const reload = () =>
      setSubmitKeyState(
        (localStorage.getItem(STORAGE_KEYS.SUBMIT_KEY) as SubmitKey | null) ?? DEFAULT,
      );
    window.addEventListener(DEVICE_SETTINGS_SEEDED_EVENT, reload);
    return () => window.removeEventListener(DEVICE_SETTINGS_SEEDED_EVENT, reload);
  }, []);

  const setSubmitKey = useCallback(
    (key: SubmitKey) => {
      setSubmitKeyState(key);
      localStorage.setItem(STORAGE_KEYS.SUBMIT_KEY, key);
      writeToServer(key);
    },
    [writeToServer],
  );

  return (
    <SubmitKeyContext.Provider value={{ submitKey, setSubmitKey }}>
      {children}
    </SubmitKeyContext.Provider>
  );
}

export function useSubmitKey(): SubmitKeyState {
  const ctx = useContext(SubmitKeyContext);
  if (!ctx) throw new Error("useSubmitKey must be used within SubmitKeyProvider");
  return ctx;
}
