import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAdminHealth } from "@/queries/adminHealthQueries";
import { useCommunities } from "@/queries/communityQueries";
import type {
  AdminSystemInfo,
  HealthCheckResult,
  HealthStatus,
  ScheduledTask,
} from "@/api/adminHealth";
import { Spinner } from "@/components/icons";
import { PresenceHistoryChart } from "@/components/PresenceHistoryChart";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.max(0, (numerator / denominator) * 100));
}

function loadColor(load: number, cpuCount: number): string {
  const perCore = load / Math.max(1, cpuCount);
  if (perCore >= 1) return "bg-red-500";
  if (perCore >= 0.7) return "bg-amber-500";
  return "bg-green-500";
}

function usageColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 75) return "bg-amber-500";
  return "bg-green-500";
}

export const Route = createFileRoute("/admin/health")({
  component: AdminHealthPage,
});

function dotClassFor(state: HealthStatus): string {
  if (state === "ok") return "bg-green-500";
  if (state === "degraded") return "bg-amber-500";
  if (state === "down") return "bg-red-500";
  return "bg-surface";
}

function textClassFor(state: HealthStatus): string {
  if (state === "ok") return "text-green-700 dark:text-green-400";
  if (state === "degraded") return "text-amber-700 dark:text-amber-400";
  if (state === "down") return "text-red-700 dark:text-red-400";
  return "text-fg-muted";
}

function AdminHealthPage() {
  const { t } = useTranslation("admin");
  const { data, isLoading, isFetching, refetch } = useAdminHealth();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t("nav_health")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("health_intro")}</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex min-h-8 items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-40"
        >
          <span className="block cap-trim">{isFetching ? t("loading") : t("refresh")}</span>
        </button>
      </header>

      {data && (
        <div
          className={
            "rounded-lg border px-4 py-3 text-sm font-semibold cap-trim " +
            (data.overall === "ok"
              ? "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300"
              : data.overall === "degraded"
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                : "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300")
          }
        >
          {t("health_overall", { status: t(`health_state_${data.overall}`) })}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner size={16} /> {t("loading")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data?.checks.map((check) => (
          <HealthCard key={check.name} t={t} check={check} />
        ))}
      </div>

      {data?.system && <SystemMetrics t={t} system={data.system} />}

      {data?.scheduledTasks && <ScheduledTasks t={t} tasks={data.scheduledTasks} />}

      <PresenceHistorySection />

      <p className="text-xs text-fg-muted">{t("health_public_note")}</p>
    </div>
  );
}

function PresenceHistorySection() {
  const { t } = useTranslation("admin");
  const { data: communities = [] } = useCommunities();
  const [identifier, setIdentifier] = useState<string>("");
  const selected = identifier || (communities[0]?.identifier ?? "");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {t("presence_history_heading")}
        </h3>
        <select
          value={selected}
          onChange={(e) => setIdentifier(e.target.value)}
          className="rounded-md border border-line bg-canvas px-2 py-1 text-sm"
        >
          {communities.map((c) => (
            <option key={c.identifier} value={c.identifier}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {selected && <PresenceHistoryChart communityIdentifier={selected} />}
    </section>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function taskLabel(t: TFunction<"admin">, name: string): string {
  const key = `cron_task_${name}`;
  const label = t(key, { defaultValue: "" });
  return label || name;
}

function ScheduledTasks({ t, tasks }: { t: TFunction<"admin">; tasks: ScheduledTask[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
        {t("health_cron_section")}
      </h3>
      <div className="overflow-x-auto rounded-lg ring-1 ring-inset ring-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-muted">
              <th className="px-4 py-2.5 font-medium">{t("cron_col_task")}</th>
              <th className="px-4 py-2.5 font-medium">{t("cron_col_frequency")}</th>
              <th className="px-4 py-2.5 font-medium">{t("cron_col_last_run")}</th>
              <th className="px-4 py-2.5 font-medium">{t("cron_col_next_run")}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.name} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-medium">{taskLabel(t, task.name)}</td>
                <td className="px-4 py-2.5 text-fg-muted">{task.description}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    {task.lastStatus && (
                      <span
                        className={
                          "h-2 w-2 shrink-0 rounded-full " +
                          (task.lastStatus === "ok" ? "bg-green-500" : "bg-red-500")
                        }
                        title={t(`cron_status_${task.lastStatus}`)}
                      />
                    )}
                    <span className={`cap-trim ${task.lastRunAt ? "" : "text-fg-muted"}`}>
                      {task.lastRunAt ? formatWhen(task.lastRunAt) : t("cron_never_run")}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-fg-muted">{formatWhen(task.nextRunAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SystemMetrics({ t, system }: { t: TFunction<"admin">; system: AdminSystemInfo }) {
  const memPercent = pct(system.memoryUsed, system.memoryTotal);
  const diskUsed = system.diskTotal - system.diskFree;
  const diskPercent = pct(diskUsed, system.diskTotal);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
        {t("health_system_section")}
      </h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-lg bg-canvas ring-1 ring-inset ring-line px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{t("health_cpu_load")}</span>
            <span className="text-xs text-fg-muted">
              {t("health_cpu_cores", { count: system.cpuCount })}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <LoadCell
              label={t("health_cpu_1m")}
              value={system.cpuLoad1}
              cpuCount={system.cpuCount}
            />
            <LoadCell
              label={t("health_cpu_5m")}
              value={system.cpuLoad5}
              cpuCount={system.cpuCount}
            />
            <LoadCell
              label={t("health_cpu_15m")}
              value={system.cpuLoad15}
              cpuCount={system.cpuCount}
            />
          </div>
        </div>

        <UsageCard
          label={t("health_memory")}
          used={system.memoryUsed}
          total={system.memoryTotal}
          percent={memPercent}
          freeLabel={t("health_free", { value: formatBytes(system.memoryFree) })}
        />

        <UsageCard
          label={t("health_disk")}
          used={diskUsed}
          total={system.diskTotal}
          percent={diskPercent}
          freeLabel={t("health_free", { value: formatBytes(system.diskFree) })}
          extra={t("health_media_size", { value: formatBytes(system.mediaSize) })}
        />
      </div>
    </section>
  );
}

function LoadCell({ label, value, cpuCount }: { label: string; value: number; cpuCount: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded border border-line px-2 py-1">
      <span className="cap-trim text-[0.625rem] uppercase tracking-wide text-fg-muted">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <span className={`inline-block h-2 w-2 rounded-full ${loadColor(value, cpuCount)}`} />
        <span className="cap-trim font-mono text-sm">{value.toFixed(2)}</span>
      </div>
    </div>
  );
}

function UsageCard({
  label,
  used,
  total,
  percent,
  freeLabel,
  extra,
}: {
  label: string;
  used: number;
  total: number;
  percent: number;
  freeLabel: string;
  extra?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-canvas ring-1 ring-inset ring-line px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs font-mono text-fg-muted">{percent.toFixed(0)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-surface">
        <div
          className={`h-full ${usageColor(percent)} transition-all`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-fg-muted">
        <span>
          {formatBytes(used)} / {formatBytes(total)}
        </span>
        <span>{freeLabel}</span>
      </div>
      {extra && <span className="text-xs text-fg-muted">{extra}</span>}
    </div>
  );
}

function HealthCard({ t, check }: { t: TFunction<"admin">; check: HealthCheckResult }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-canvas ring-1 ring-inset ring-line px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotClassFor(check.status)}`} />
          <span className="cap-trim text-sm font-medium">
            {t(`health_probe_${check.name}` as never)}
          </span>
        </div>
        <div className={`cap-trim text-xs font-semibold ${textClassFor(check.status)}`}>
          {t(`health_state_${check.status}`)}
        </div>
      </div>
      <div className="flex justify-between text-xs text-fg-muted">
        <span>{check.latencyMs} ms</span>
        {check.error && (
          <span className="ml-2 truncate text-red-600 dark:text-red-400" title={check.error}>
            {check.error}
          </span>
        )}
      </div>
    </div>
  );
}
