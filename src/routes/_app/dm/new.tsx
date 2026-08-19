import { createFileRoute } from "@tanstack/react-router";
import { ComposeConversation } from "@/components/dm/ComposeConversation";

export const Route = createFileRoute("/_app/dm/new")({
  component: ComposeConversation,
});
