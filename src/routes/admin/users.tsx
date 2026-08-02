import { formatShortDate as fmtDate } from "@/utils/dateFormat";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAdminUsers } from "@/queries/adminUserQueries";
import { Spinner } from "@/components/icons";
import { AdminUserDetailDrawer } from "@/components/admin/AdminUserDetailDrawer";
import { CreateUserModal } from "@/components/admin/CreateUserModal";
import { SortableTh } from "@/components/admin/SortableTh";
import type { AdminUserSort } from "@/api/adminUsers";

type AdminFilter = "" | "true" | "false";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { t } = useTranslation("admin");
  const [search, setSearch] = useState("");
  const [adminFilter, setAdminFilter] = useState<AdminFilter>("");
  const [pendingFilter, setPendingFilter] = useState<AdminFilter>("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sort, setSort] = useState<AdminUserSort>("id");
  const [dir, setDir] = useState<"ASC" | "DESC">("DESC");

  const handleSort = (column: AdminUserSort) => {
    if (sort === column) {
      setDir((d) => (d === "ASC" ? "DESC" : "ASC"));
    } else {
      setSort(column);
      setDir("ASC");
    }
    setPage(1);
  };

  const params = useMemo(
    () => ({
      search: search || undefined,
      isAdmin: adminFilter === "" ? undefined : adminFilter === "true",
      isPendingDeletion: pendingFilter === "" ? undefined : pendingFilter === "true",
      page,
      perPage: 25,
      sort,
      dir,
    }),
    [search, adminFilter, pendingFilter, page, sort, dir],
  );

  const { data, isLoading } = useAdminUsers(params);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t("nav_users")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("users_intro")}</p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-sm text-fg-muted">{t("user_count", { count: data.total })}</span>
          )}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-8 items-center rounded-lg bg-accent-gradient px-3 py-1.5 text-sm font-semibold text-[var(--accent-on)]"
          >
            <span className="block cap-trim">{t("new_user")}</span>
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-fg-muted">{t("filter_search")}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("filter_search_placeholder")}
            className="rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-fg-muted">{t("filter_role")}</span>
          <select
            value={adminFilter}
            onChange={(e) => {
              setAdminFilter(e.target.value as AdminFilter);
              setPage(1);
            }}
            className="rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm"
          >
            <option value="">{t("filter_any")}</option>
            <option value="true">{t("filter_admins")}</option>
            <option value="false">{t("filter_non_admins")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-fg-muted">{t("filter_pending_deletion")}</span>
          <select
            value={pendingFilter}
            onChange={(e) => {
              setPendingFilter(e.target.value as AdminFilter);
              setPage(1);
            }}
            className="rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm"
          >
            <option value="">{t("filter_any")}</option>
            <option value="true">{t("filter_pending_yes")}</option>
            <option value="false">{t("filter_pending_no")}</option>
          </select>
        </label>
      </div>

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
              <SortableTh
                label={t("col_email")}
                column="email"
                sort={sort}
                dir={dir}
                onSort={handleSort}
              />
              <th className="px-4 py-3">{t("col_roles")}</th>
              <th className="px-4 py-3">{t("col_state")}</th>
              <SortableTh
                label={t("col_joined")}
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
                <td colSpan={6} className="px-4 py-6 text-center text-fg-muted">
                  <Spinner size={16} /> {t("loading")}
                </td>
              </tr>
            )}
            {!isLoading && data?.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-fg-muted">
                  {t("users_empty")}
                </td>
              </tr>
            )}
            {data?.rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer transition-colors hover:bg-accent-subtle/30"
                onClick={() => setSelectedId(row.id)}
              >
                <td className="px-4 py-3 font-medium">{row.displayName ?? <em>—</em>}</td>
                <td className="px-4 py-3 text-fg-muted">{row.email}</td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap gap-1">
                    {row.isAdmin ? (
                      <span className="inline-flex min-h-5 items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                        <span className="block cap-trim">{t("badge_admin")}</span>
                      </span>
                    ) : (
                      <span className="inline-flex min-h-5 items-center rounded-full bg-accent-subtle px-2.5 py-0.5 text-xs font-semibold text-accent-text">
                        <span className="block cap-trim">{t("badge_member")}</span>
                      </span>
                    )}
                    {row.isBot && (
                      <span className="inline-flex min-h-5 items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-fg-muted ring-1 ring-inset ring-line">
                        <span className="block cap-trim">{t("badge_bot")}</span>
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {row.isPendingDeletion ? (
                    <span className="inline-flex min-h-5 items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      <span className="block cap-trim">{t("badge_pending_deletion")}</span>
                    </span>
                  ) : (
                    <span className="inline-flex min-h-5 items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                      <span className="block cap-trim">{t("badge_active")}</span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-fg-muted">{fmtDate(row.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(row.id);
                    }}
                    className="text-sm text-accent-text hover:underline"
                  >
                    {t("action_view")}
                  </button>
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

      {selectedId !== null && (
        <AdminUserDetailDrawer userId={selectedId} onClose={() => setSelectedId(null)} />
      )}
      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
