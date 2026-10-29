import { createFileRoute } from "@tanstack/react-router";
import { ComposeConversation } from "@/components/dm/ComposeConversation";

interface ComposeSearch {
  to?: number;
}

export const Route = createFileRoute("/_app/dm/new")({
  validateSearch: (search: Record<string, unknown>): ComposeSearch => {
    const to = Number(search.to);
    return Number.isSafeInteger(to) && to > 0 ? { to } : {};
  },
  component: ComposeRoute,
});

function ComposeRoute() {
  const { to } = Route.useSearch();
  return <ComposeConversation initialRecipientId={to ?? null} />;
}
