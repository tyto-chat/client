import { useEffect } from "react";
import { useBlocker } from "@tanstack/react-router";

export function useUnsavedGuard(
  dirty: boolean,
  message = "You have unsaved changes. Leave anyway?",
) {
  useBlocker({
    disabled: !dirty,
    shouldBlockFn: () => !window.confirm(message),
  });

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
