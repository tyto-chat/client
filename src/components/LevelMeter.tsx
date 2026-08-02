import { useEffect, useRef } from "react";
import type React from "react";

export function LevelMeter({
  micLevelRef,
  thresholdPct,
}: {
  micLevelRef: React.MutableRefObject<number>;
  thresholdPct: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    function tick() {
      if (barRef.current) {
        const level = Math.min(micLevelRef.current * 100, 100);
        barRef.current.style.width = `${level.toFixed(1)}%`;
        barRef.current.style.backgroundColor = level > thresholdPct ? "#22c55e" : "#9ca3af";
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [micLevelRef, thresholdPct]);

  return (
    <div className="relative h-1.5 w-full overflow-visible rounded-full bg-surface">
      <div
        ref={barRef}
        className="h-full rounded-full"
        style={{ width: "0%", backgroundColor: "#9ca3af" }}
      />
      <div
        className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-canvas/90 shadow dark:bg-white/70"
        style={{ left: `${thresholdPct}%` }}
      />
    </div>
  );
}
