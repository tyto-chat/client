import { useEffect, useRef } from "react";

function isWatching(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

export function useReadWhileViewing(markRead: () => void, unreadCount: number): void {
  const markReadRef = useRef(markRead);
  useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);

  const pendingRef = useRef(false);
  const lastCountRef = useRef(unreadCount);
  useEffect(() => {
    const grew = unreadCount > lastCountRef.current;
    lastCountRef.current = unreadCount;
    if (!grew) return;
    if (isWatching()) markReadRef.current();
    else pendingRef.current = true;
  }, [unreadCount]);

  useEffect(() => {
    const onReturn = () => {
      if (!pendingRef.current || !isWatching()) return;
      pendingRef.current = false;
      markReadRef.current();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, []);
}
