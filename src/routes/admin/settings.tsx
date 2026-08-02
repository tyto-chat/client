import { createFileRoute } from "@tanstack/react-router";
import { AdminSettingsTabs } from "@/components/admin/settings/AdminSettingsTabs";

export const Route = createFileRoute("/admin/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const { tab } = Route.useSearch();
  return <AdminSettingsTabs initialTab={tab} />;
}
