import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { E2eeIdentity } from "./conversationSession";
import { E2eeContext, type E2eeContextValue } from "./e2eeContextValue";
import { onE2eeEvent } from "./e2eeEvents";
import { isE2eeCapable } from "./isE2eeCapable";
import { reapplyAdmission, setActiveSecurity } from "./admission";
import type { LocalSecurityState } from "./localSecurityState";
import { useE2eeSync } from "@/queries/e2eeQueries";

const noSubscription = () => () => undefined;
const noSnapshot = () => null;

export function E2eeProvider({
  children,
  identity: initial = null,
  security: initialSecurity = null,
  capable,
}: {
  children: ReactNode;
  identity?: E2eeIdentity | null;
  security?: LocalSecurityState | null;
  capable?: boolean;
}) {
  const queryClient = useQueryClient();
  const [identity, setIdentity] = useState<E2eeIdentity | null>(initial);
  const [security, setSecurity] = useState<LocalSecurityState | null>(initialSecurity);
  const supported = capable ?? isE2eeCapable();
  useE2eeSync(identity);

  const securitySnapshot = useSyncExternalStore(
    security === null ? noSubscription : (listener) => security.subscribe(listener),
    security === null ? noSnapshot : () => security.snapshot(),
  );

  const refusalKey =
    securitySnapshot === null
      ? "none"
      : `${securitySnapshot.refusal.on}:${securitySnapshot.refusal.since}`;

  useEffect(() => {
    setActiveSecurity(securitySnapshot);
  }, [securitySnapshot]);

  useEffect(() => {
    if (refusalKey !== "none") reapplyAdmission(queryClient);
  }, [refusalKey, queryClient]);

  useEffect(() => () => setActiveSecurity(null), []);

  useEffect(() => {
    if (identity === null) return;
    return onE2eeEvent((event) => void identity.handleEvent(event).catch(() => undefined));
  }, [identity]);

  useEffect(() => {
    if (identity === null || security === null) return;
    return identity.onChange(() => void security.refreshPins().catch(() => undefined));
  }, [identity, security]);

  const value = useMemo<E2eeContextValue>(
    () => ({
      identity,
      availability: !supported ? "unsupported" : identity === null ? "not_restored" : "ready",
      setIdentity,
      security,
      securitySnapshot,
      setSecurity,
    }),
    [identity, supported, security, securitySnapshot],
  );
  return <E2eeContext.Provider value={value}>{children}</E2eeContext.Provider>;
}
