import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePresenceHistory } from "@/queries/presenceQueries";
import { Spinner } from "@/components/icons";
import type { PresenceHistoryPoint } from "@/api/presence";

const RANGES = [
  { key: "24h", days: 1 },
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
] as const;

const H = 190;
const PADL = 34;
const PADR = 10;
const PADT = 10;
const PADB = 22;
const DOT_LIMIT = 60;

function thin(points: PresenceHistoryPoint[], max: number): PresenceHistoryPoint[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  return Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]!);
}

function niceCeil(v: number): number {
  if (v <= 10) return Math.max(2, Math.ceil(v / 2) * 2);
  const pow = 10 ** Math.floor(Math.log10(v));
  const scaled = v / pow;
  const m = [2, 4, 6, 8, 10].find((c) => scaled <= c) ?? 10;
  return m * pow;
}

function timeLabel(iso: string, days: number, locale: string): string {
  const d = new Date(iso);
  if (days === 1) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (days === 7)
    return d.toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function tooltipTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PresenceHistoryChart({ communityIdentifier }: { communityIdentifier: string }) {
  const { t, i18n } = useTranslation("community");
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const { data, isLoading } = usePresenceHistory(communityIdentifier, range.days);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const points = useMemo(() => thin(data ?? [], 360), [data]);
  const yMax = useMemo(
    () => niceCeil(Math.max(1, ...points.map((p) => Math.max(p.membersOnline, p.guestsOnline)))),
    [points],
  );

  const w = width || 600;
  const plotW = w - PADL - PADR;
  const plotH = H - PADT - PADB;
  const n = points.length;
  const x = (i: number) => PADL + (i / Math.max(1, n - 1)) * plotW;
  const y = (v: number) => PADT + (1 - v / yMax) * plotH;
  const poly = (values: number[]) =>
    values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const xTickIdx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : [0];
  const hover = hoverIdx !== null ? points[hoverIdx] : undefined;

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = e.clientX - rect.left;
    const idx = Math.round(((fx - PADL) / Math.max(1, plotW)) * (n - 1));
    setHoverIdx(Math.min(n - 1, Math.max(0, idx)));
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              range.key === r.key
                ? "bg-accent-subtle text-accent-text"
                : "text-fg-muted hover:bg-surface"
            }`}
          >
            {r.key}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-3 text-[0.6875rem] text-fg-muted">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 rounded bg-accent" /> {t("presence_chart_members")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 rounded bg-fg-subtle" /> {t("presence_chart_guests")}
          </span>
        </span>
      </div>
      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-fg-subtle">
          <Spinner />
        </div>
      ) : points.length === 0 ? (
        <div
          data-testid="presence-history-empty"
          className="flex h-40 items-center justify-center rounded-lg border border-line text-sm text-fg-muted"
        >
          {t("presence_chart_empty")}
        </div>
      ) : (
        <div ref={wrapRef} className="relative">
          <svg
            data-testid="presence-history-chart"
            width={w}
            height={H}
            viewBox={`0 0 ${w} ${H}`}
            className="w-full rounded-lg border border-line bg-surface"
            onMouseMove={onMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {[0, yMax / 2, yMax].map((v) => (
              <g key={v}>
                <line
                  x1={PADL}
                  x2={w - PADR}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="var(--color-line)"
                  strokeWidth="1"
                />
                <text
                  x={PADL - 6}
                  y={y(v) + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--color-fg-subtle)"
                >
                  {v}
                </text>
              </g>
            ))}
            {xTickIdx.map((i, k) => (
              <text
                key={i}
                x={x(i)}
                y={H - 7}
                textAnchor={k === 0 ? "start" : k === xTickIdx.length - 1 ? "end" : "middle"}
                fontSize="10"
                fill="var(--color-fg-subtle)"
              >
                {points[i] ? timeLabel(points[i].sampledAt, range.days, i18n.language) : ""}
              </text>
            ))}
            <polyline
              points={poly(points.map((p) => p.guestsOnline))}
              fill="none"
              stroke="var(--color-fg-subtle)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <polyline
              points={poly(points.map((p) => p.membersOnline))}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
            />
            {n <= DOT_LIMIT &&
              points.map((p, i) => (
                <g key={p.sampledAt}>
                  <circle cx={x(i)} cy={y(p.guestsOnline)} r="2" fill="var(--color-fg-subtle)" />
                  <circle cx={x(i)} cy={y(p.membersOnline)} r="2.5" fill="var(--accent)" />
                </g>
              ))}
            {hoverIdx !== null && hover && (
              <g>
                <line
                  x1={x(hoverIdx)}
                  x2={x(hoverIdx)}
                  y1={PADT}
                  y2={PADT + plotH}
                  stroke="var(--color-line-strong)"
                  strokeWidth="1"
                />
                <circle
                  cx={x(hoverIdx)}
                  cy={y(hover.guestsOnline)}
                  r="3.5"
                  fill="var(--color-fg-subtle)"
                />
                <circle cx={x(hoverIdx)} cy={y(hover.membersOnline)} r="4" fill="var(--accent)" />
              </g>
            )}
          </svg>
          {hoverIdx !== null && hover && (
            <div
              data-testid="presence-history-tooltip"
              className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border border-line bg-overlay px-2.5 py-1.5 text-xs shadow-soft-md"
              style={{ left: Math.min(Math.max(x(hoverIdx), 70), w - 70) }}
            >
              <div className="mb-0.5 font-medium text-fg">
                {tooltipTime(hover.sampledAt, i18n.language)}
              </div>
              <div className="flex items-center gap-1.5 text-fg-muted">
                <span className="h-2 w-2 rounded-full bg-accent" />
                {t("presence_chart_members")}: {hover.membersOnline}
              </div>
              <div className="flex items-center gap-1.5 text-fg-muted">
                <span className="h-2 w-2 rounded-full bg-fg-subtle" />
                {t("presence_chart_guests")}: {hover.guestsOnline}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
