import { useCallback, useLayoutEffect, useRef, useState } from "react";

const MARGIN = 8;

export function useViewportClamp(open: boolean) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [attached, setAttached] = useState(0);

  const setNode = useCallback((el: HTMLDivElement | null) => {
    nodeRef.current = el;
    setAttached((n) => n + 1);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const el = nodeRef.current;
    if (!el) return;

    const apply = () => {
      el.style.transform = "";
      const box = el.getBoundingClientRect();
      let shift = 0;
      if (box.right > window.innerWidth - MARGIN) shift = window.innerWidth - MARGIN - box.right;
      if (box.left + shift < MARGIN) shift = MARGIN - box.left;
      el.style.transform = shift ? `translateX(${shift}px)` : "";
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [open, attached]);

  return setNode;
}
