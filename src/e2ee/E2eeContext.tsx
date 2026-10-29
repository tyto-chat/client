import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { E2eeIdentity } from "./conversationSession";
import { E2eeContext, type E2eeContextValue } from "./e2eeContextValue";
import { onE2eeEvent } from "./e2eeEvents";
import { isE2eeCapable } from "./isE2eeCapable";
import { useE2eeSync } from "@/queries/e2eeQueries";

export function E2eeProvider({
  children,
  identity: initial = null,
  capable,
}: {
  children: ReactNode;
  identity?: E2eeIdentity | null;
  capable?: boolean;
}) {
  const [identity, setIdentity] = useState<E2eeIdentity | null>(initial);
  const supported = capable ?? isE2eeCapable();
  useE2eeSync(identity);

  useEffect(() => {
    if (identity === null) return;
    return onE2eeEvent((event) => void identity.handleEvent(event).catch(() => undefined));
  }, [identity]);

  const value = useMemo<E2eeContextValue>(
    () => ({
      identity,
      availability: !supported ? "unsupported" : identity === null ? "not_restored" : "ready",
      setIdentity,
    }),
    [identity, supported],
  );
  return <E2eeContext.Provider value={value}>{children}</E2eeContext.Provider>;
}
