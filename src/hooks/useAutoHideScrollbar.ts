import { useEffect, useRef } from "react";

const HIDE_AFTER_MS = 1500;

export function useAutoHideScrollbar<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onScroll() {
      node!.classList.add("scrolling");
      clearTimeout(timer);
      timer = setTimeout(() => node!.classList.remove("scrolling"), HIDE_AFTER_MS);
    }

    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      node.removeEventListener("scroll", onScroll);
    };
  }, []);

  return ref;
}
