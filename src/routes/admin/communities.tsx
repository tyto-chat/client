import { formatShortDate as fmt } from "@/utils/dateFormat";
import { Modal } from "@/components/Modal";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminCommunities, useDeleteAdminCommunity } from "@/queries/adminCommunityQueries";
import { Spinner } from "@/components/icons";
import { useNotification } from "@/context/NotificationContext";
import { CreateCommunityModal } from "@/components/CreateCommunityModal";
import { AdminEditCommunityModal } from "@/components/admin/AdminEditCommunityModal";
import { SortableTh } from "@/components/admin/SortableTh";
import type { AdminCommunitySort } from "@/api/adminCommunities";

export const Route = createFileRoute("/admin/communities")({
  component: AdminCommunitiesPage,
});

function AdminCommunitiesPage() {
  const { t } = useTranslation("admin");
  const { t: tCommunity } = useTranslation("community");
  const { notify } = useNotification();
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmIdentifier, setConfirmIdentifier] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [editIdentifier, setEditIdentifier] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<AdminCommunitySort>("createdAt");
  const [dir, setDir] = useState<"ASC" | "DESC">("DESC");

  const handleSort = (column: AdminCommunitySort) => {
    if (sort === column) {
      setDir((d) => (d === "ASC" ? "DESC" : "ASC"));
    } else {
      setSort(column);
      setDir("ASC");
    }
    setPage(1);
  };

  const params = useMemo(
    () => ({ search: search || undefined, page, perPage: 25, sort, dir }),
    [search, page, sort, dir],
  );
  const { data, isLoading } = useAdminCommunities(params);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const deleteMutation = useDeleteAdminCommunity();

  const confirmTarget = data?.rows.find((r) => r.identifier === confirmIdentifier);

  async function onDelete() {
    if (!confirmTarget) return;
    if (confirmName !== confirmTarget.name) return;
    try {
      await deleteMutation.mutateAsync(confirmTarget.identifier);
      notify(t("community_deleted"), "success");
      setConfirmIdentifier(null);
      setConfirmName("");
    } catch {
      notify(t("community_delete_failed"), "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t("nav_communities")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("communities_intro")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
        >
          {tCommunity("create_community_button")}
        </button>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder={t("communities_search_placeholder")}
        className="max-w-sm rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm"
      />

      <div className="overflow-x-auto rounded-lg bg-canvas ring-1 ring-inset ring-line">
        <table className="min-w-full text-sm">
          <thead className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">
            <tr>
              <SortableTh
                label={t("col_name")}
                column="name"
                sort={sort}
                dir={dir}
                onSort={handleSort}
              />
              <th className="px-4 py-3">{t("col_identifier")}</th>
              <th className="px-4 py-3 text-right">{t("col_members")}</th>
              <th className="px-4 py-3 text-right">{t("col_messages")}</th>
              <th className="px-4 py-3">{t("col_visibility")}</th>
              <SortableTh
                label={t("col_created")}
                column="createdAt"
                sort={sort}
                dir={dir}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-right">{t("col_actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-fg-muted">
                  <Spinner size={16} /> {t("loading")}
                </td>
              </tr>
            )}
            {!isLoading && data?.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-fg-muted">
                  {t("communities_empty")}
                </td>
              </tr>
            )}
            {data?.rows.map((row) => (
              <tr key={row.id} className="hover:bg-surface">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-fg-muted">
                  <code>{row.identifier}</code>
                </td>
                <td className="px-4 py-3 text-right">{row.memberCount}</td>
                <td className="px-4 py-3 text-right">{row.messageCount}</td>
                <td className="px-4 py-3">
                  {row.isPrivate ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {t("badge_private")}
                    </span>
                  ) : (
                    <span className="text-xs text-fg-muted">{t("badge_public")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-fg-muted">{fmt(row.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditIdentifier(row.identifier)}
                      className="text-sm text-accent-text hover:underline"
                    >
                      {t("action_edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmIdentifier(row.identifier);
                        setConfirmName("");
                      }}
                      className="text-sm font-semibold text-red-600 hover:underline"
                    >
                      {t("action_delete")}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-fg-muted">
          <span>{t("pagination_label", { page, totalPages })}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-line px-3 py-1 hover:bg-surface disabled:opacity-40"
            >
              {t("pagination_prev")}
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-line px-3 py-1 hover:bg-surface disabled:opacity-40"
            >
              {t("pagination_next")}
            </button>
          </div>
        </div>
      )}

      {showCreateModal && <CreateCommunityModal onClose={() => setShowCreateModal(false)} />}

      {editIdentifier !== null && (
        <AdminEditCommunityModal
          identifier={editIdentifier}
          onClose={() => setEditIdentifier(null)}
        />
      )}

      {confirmTarget && (
        <Modal
          title={
            <span className="text-red-700 dark:text-red-300">
              {t("community_delete_title", { name: confirmTarget.name })}
            </span>
          }
          onClose={() => setConfirmIdentifier(null)}
        >
          {(close) => (
            <>
              <p className="mb-4 text-sm text-fg">{t("community_delete_intro")}</p>
              <label className="mb-3 block text-xs text-red-700 dark:text-red-300">
                {t("community_type_name_to_confirm", { name: confirmTarget.name })}
              </label>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                className="mb-4 w-full rounded-md border border-red-300 bg-canvas px-3 py-1.5 text-sm dark:border-red-700"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="text-sm text-fg-muted hover:text-fg dark:hover:text-white"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  disabled={confirmName !== confirmTarget.name || deleteMutation.isPending}
                  onClick={() => void onDelete()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {deleteMutation.isPending ? t("deleting") : t("confirm_delete")}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
