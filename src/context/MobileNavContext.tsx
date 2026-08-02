/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface MobileNavContextValue {
  navOpen: boolean;
  openNav: () => void;
  closeNav: () => void;
  toggleNav: () => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  const openNav = useCallback(() => setNavOpen(true), []);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const toggleNav = useCallback(() => setNavOpen((v) => !v), []);

  const value = useMemo(
    () => ({ navOpen, openNav, closeNav, toggleNav }),
    [navOpen, openNav, closeNav, toggleNav],
  );

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavContextValue {
  const ctx = useContext(MobileNavContext);
  if (!ctx) {
    throw new Error("useMobileNav must be used within a MobileNavProvider");
  }
  return ctx;
}
