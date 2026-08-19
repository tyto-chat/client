import { useEffect, useState, type ReactNode } from "react";

export function FadeOutOverlay({
  show,
  durationMs = 200,
  className,
  children,
}: {
  show: boolean;
  durationMs?: number;
  className: string;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<"covering" | "fading" | "gone">(() =>
    show ? "covering" : "gone",
  );

  useEffect(() => {
    if (!show && phase === "covering") {
      let started = false;
      let fadeTimer: ReturnType<typeof setTimeout> | undefined;
      const begin = () => {
        if (started) return;
        started = true;
        setPhase("fading");
        fadeTimer = setTimeout(() => setPhase("gone"), durationMs + 50);
      };
      // rAF lets the content beneath paint first; the timeout covers occluded tabs where rAF starves.
      const raf = requestAnimationFrame(() => requestAnimationFrame(begin));
      const fallback = setTimeout(begin, 150);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(fallback);
        if (fadeTimer !== undefined) clearTimeout(fadeTimer);
      };
    }
    return undefined;
  }, [show, phase, durationMs]);

  if (phase === "gone") return null;
  return (
    <div
      className={`pointer-events-none transition-opacity ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      } ${className}`}
      style={{ transitionDuration: `${durationMs}ms` }}
    >
      {children}
    </div>
  );
}
