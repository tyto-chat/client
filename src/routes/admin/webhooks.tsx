import { createFileRoute } from "@tanstack/react-router";
import { WebhookList } from "@/components/admin/webhooks/WebhookList";

export const Route = createFileRoute("/admin/webhooks")({
  component: AdminWebhooksPage,
});

function AdminWebhooksPage() {
  return <WebhookList />;
}
