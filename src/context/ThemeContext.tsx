/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { usePreferenceSync } from "@/hooks/usePreferenceSync";

type Theme = "light" | "dark";
export type ThemePreference = "system" | "light" | "dark";

interface ThemeState {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

const subscribeSystemDark = (cb: () => void) => {
  const query = darkQuery();
  query.addEventListener("change", cb);
  return () => query.removeEventListener("change", cb);
};

function loadPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEYS.THEME);
  return stored === "system" || stored === "light" || stored === "dark" ? stored : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(loadPreference);
  const systemDark = useSyncExternalStore(subscribeSystemDark, () => darkQuery().matches);
  const theme: Theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.THEME, preference);
  }, [preference]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const { writeToServer } = usePreferenceSync("theme", (value) => {
    if (value === "system" || value === "light" || value === "dark") setPreferenceState(value);
  });

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPreferenceState(p);
      writeToServer(p);
    },
    [writeToServer],
  );

  const toggle = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [theme, setPreference]);

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
