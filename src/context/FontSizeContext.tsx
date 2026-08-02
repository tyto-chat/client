/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { STORAGE_KEYS } from "@/utils/storageKeys";

export type FontSize = "100%" | "125%" | "150%";

interface FontSizeState {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
}

const FontSizeContext = createContext<FontSizeState | null>(null);

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(
    () => (localStorage.getItem(STORAGE_KEYS.FONT_SIZE) as FontSize) ?? "100%",
  );

  useEffect(() => {
    document.documentElement.style.fontSize = fontSize;
    localStorage.setItem(STORAGE_KEYS.FONT_SIZE, fontSize);
  }, [fontSize]);

  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
  }, []);

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize(): FontSizeState {
  const ctx = useContext(FontSizeContext);
  if (!ctx) throw new Error("useFontSize must be used within FontSizeProvider");
  return ctx;
}
