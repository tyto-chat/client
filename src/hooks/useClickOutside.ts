import { useEffect, useRef, type RefObject } from "react";

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null> | Array<RefObject<T | null>>,
  onClickOutside: () => void,
  enabled = true,
  options?: { onEscape?: () => void },
): void {
  const callbackRef = useRef(onClickOutside);
  const escapeRef = useRef(options?.onEscape);

  useEffect(() => {
    callbackRef.current = onClickOutside;
    escapeRef.current = options?.onEscape;
  });

  useEffect(() => {
    if (!enabled) return;
    const refs = Array.isArray(ref) ? ref : [ref];
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      const inside = refs.some((r) => r.current && r.current.contains(target));
      const anyMounted = refs.some((r) => r.current);
      if (anyMounted && !inside) {
        callbackRef.current();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && escapeRef.current) {
        e.stopPropagation();
        escapeRef.current();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(ref) ? ref.length : ref, enabled]);
}
