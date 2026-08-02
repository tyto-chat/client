import { createFileRoute, Outlet, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { fetchMe } from "@/api/users";
import { queryKeys } from "@/queries/queryKeys";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context: { auth, queryClient }, location }) => {
    // On a cold load (refresh, bookmark) the auth context has a token but has
    // not resolved the user yet, so the roles have to be fetched here or an
    // admin gets bounced out of their own admin area.
    let user = auth.user;
    if (!user && auth.token) {
      user = await queryClient
        .ensureQueryData({ queryKey: queryKeys.currentUser(), queryFn: fetchMe })
        .catch(() => null);
    }

    const isAdmin = user?.roles?.includes("ROLE_ADMIN") ?? false;
    if (!isAdmin) {
      throw redirect({ to: "/" });
    }
    if (location.pathname === "/admin" || location.pathname === "/admin/") {
      throw redirect({ to: "/admin/users" });
    }
  },
  component: AdminShell,
});

function AdminShell() {
  const { t } = useTranslation("admin");

  return (
    <div
      data-testid="admin-shell"
      className="flex h-dvh bg-surface text-fg max-md:flex-col dark:text-white"
    >
      <aside className="flex w-60 flex-col border-r border-line bg-canvas px-3 py-4 max-md:w-full max-md:border-b max-md:border-r-0 max-md:py-2">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted hover:text-fg max-md:mb-2 dark:hover:text-white"
        >
          ← {t("back_to_app")}
        </Link>

        <h1 className="mb-3 px-2 text-sm font-bold uppercase tracking-wide text-fg-muted max-md:hidden">
          {t("nav_heading")}
        </h1>

        <nav className="flex flex-col gap-1 max-md:flex-row max-md:overflow-x-auto">
          <AdminNavLink to="/admin/users" label={t("nav_users")} />
          <AdminNavLink to="/admin/communities" label={t("nav_communities")} />
          <AdminNavLink to="/admin/settings" label={t("nav_settings")} />
          <AdminNavLink to="/admin/health" label={t("nav_health")} />
          <AdminNavLink to="/admin/webhooks" label={t("nav_webhooks")} />
          <AdminNavLink to="/admin/reports" label={t("nav_reports")} />
          <AdminNavLink to="/admin/audit" label={t("nav_audit")} />
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-8 max-md:p-4">
        <Outlet />
      </main>
    </div>
  );
}

function AdminNavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-fg hover:bg-surface"
      activeProps={{
        "aria-current": "page",
        className:
          "flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold bg-accent-gradient text-on-accent shadow-soft-sm transition hover:opacity-90",
      }}
    >
      <span className="block cap-trim">{label}</span>
    </Link>
  );
}
