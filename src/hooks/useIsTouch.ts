import { useEffect, useState } from "react";

export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches === true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const on = () => setTouch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  return touch;
}
