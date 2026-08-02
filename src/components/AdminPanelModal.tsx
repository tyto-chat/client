import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStats } from "@/queries/statsQueries";
import { Spinner } from "@/components/icons";
import type { CommunityStats, SystemInfo } from "@/types/api";
import { sectionHeading } from "@/components/ui/styles";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-[var(--accent)]";
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SystemCard({ system }: { system: SystemInfo }) {
  const { t } = useTranslation(["admin", "common"]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl bg-canvas ring-1 ring-inset ring-line p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t("cpu_load")}
        </p>
        <p className="mt-1 text-xs text-fg-subtle">
          {system.cpuCount} {t("cpu_threads")}
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          {(
            [
              ["min_1", system.cpuLoad1],
              ["min_5", system.cpuLoad5],
              ["min_15", system.cpuLoad15],
            ] as [string, number][]
          ).map(([label, val]) => (
            <div key={label} className="flex flex-col items-center">
              <span className="text-lg font-bold text-fg dark:text-white">{val.toFixed(2)}</span>
              <span className="text-xs text-fg-subtle">{t(label as never)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-canvas ring-1 ring-inset ring-line p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("memory")}</p>
        <p className="mt-2 text-lg font-bold text-fg dark:text-white">
          {formatBytes(system.memoryUsed)}{" "}
          <span className="text-sm font-normal text-fg-subtle">
            / {formatBytes(system.memoryTotal)}
          </span>
        </p>
        <UsageBar used={system.memoryUsed} total={system.memoryTotal} />
        <p className="mt-1 text-xs text-fg-subtle">
          {formatBytes(system.memoryFree)} {t("free")}
        </p>
      </div>

      <div className="rounded-xl bg-canvas ring-1 ring-inset ring-line p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("disk")}</p>
        <p className="mt-2 text-lg font-bold text-fg dark:text-white">
          {formatBytes(system.diskTotal - system.diskFree)}{" "}
          <span className="text-sm font-normal text-fg-subtle">
            / {formatBytes(system.diskTotal)}
          </span>
        </p>
        <UsageBar used={system.diskTotal - system.diskFree} total={system.diskTotal} />
        <p className="mt-1 text-xs text-fg-subtle">
          {formatBytes(system.diskFree)} {t("free")}
        </p>
      </div>

      <div className="rounded-xl bg-canvas ring-1 ring-inset ring-line p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t("media_storage")}
        </p>
        <p className="mt-2 text-lg font-bold text-fg dark:text-white">
          {formatBytes(system.mediaSize)}
        </p>
        <p className="mt-1 text-xs text-fg-subtle">
          {formatBytes(system.diskFree)} {t("free")} {t("disk").toLowerCase()}
        </p>
      </div>
    </div>
  );
}

function CommunitiesTable({ communities }: { communities: CommunityStats[] }) {
  const { t } = useTranslation(["admin", "common"]);

  if (communities.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl bg-canvas ring-1 ring-inset ring-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {(
              [
                "communities",
                "channels",
                "members",
                "messages",
                "attachments",
                "attachments_size",
              ] as const
            ).map((key, i) => (
              <th
                key={key}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-fg-muted ${i === 0 ? "text-left" : "text-right"}`}
              >
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {communities.map((c) => (
            <tr key={c.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3 font-medium text-fg dark:text-white">
                {c.name}
                <span className="ml-1.5 text-xs text-fg-subtle">#{c.identifier}</span>
              </td>
              <td className="px-4 py-3 text-right text-fg">{c.channelCount}</td>
              <td className="px-4 py-3 text-right text-fg">{c.memberCount}</td>
              <td className="px-4 py-3 text-right text-fg">{c.messageCount}</td>
              <td className="px-4 py-3 text-right text-fg">{c.attachmentCount}</td>
              <td className="px-4 py-3 text-right text-fg">{formatBytes(c.attachmentsSize)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPanelModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["admin", "common"]);
  const { data, isLoading, refetch, isFetching } = useStats();
  const [isClosing, setIsClosing] = useState(false);

  function handleClose() {
    setIsClosing(true);
    setTimeout(onClose, 170);
  }

  return (
    <div
      className={`${isClosing ? "animate-backdrop-out" : "animate-backdrop-in"} fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12`}
      onMouseDown={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`${isClosing ? "animate-modal-out" : "animate-modal-in"} relative w-full max-w-5xl rounded-xl bg-surface p-6 text-fg shadow-soft-lg dark:text-white`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between pr-6">
          <h2 className="text-xl font-bold">{t("title")}</h2>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface disabled:opacity-50"
          >
            {isFetching ? <Spinner size={14} /> : null}
            {t("refresh")}
          </button>
        </div>

        <button
          onClick={handleClose}
          aria-label={t("common:close")}
          title={t("common:close")}
          className="absolute right-4 top-4 text-fg-subtle hover:text-fg dark:hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner size={32} className="text-[var(--accent)]" />
            <span className="ml-3 text-fg-muted">{t("loading")}</span>
          </div>
        ) : data ? (
          <div className="space-y-6">
            <section>
              <h3 className={sectionHeading}>{t("system")}</h3>
              <SystemCard system={data.system} />
            </section>

            {data.communities.length > 0 && (
              <section>
                <h3 className={sectionHeading}>{t("communities")}</h3>
                <CommunitiesTable communities={data.communities} />
              </section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
