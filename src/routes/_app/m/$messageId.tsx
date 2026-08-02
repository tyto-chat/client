import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { fetchMessage } from "@/api/messages";
import { ApiError } from "@/api/client";
import { uuidFromIri } from "@/api/hydra";

function uuidFromIriOrObject(value: unknown): string | null {
  if (typeof value === "string") {
    return uuidFromIri(value) || null;
  }
  if (value && typeof value === "object" && "@id" in value && typeof value["@id"] === "string") {
    return uuidFromIri(value["@id"]) || null;
  }
  return null;
}

export const Route = createFileRoute("/_app/m/$messageId")({
  loader: async ({ params }) => {
    try {
      const message = await fetchMessage(params.messageId);

      if (message.channelIdentifier && message.communityIdentifier) {
        const parentUuid = uuidFromIriOrObject(message.parent);
        if (parentUuid) {
          throw redirect({
            to: "/$communityId/$channelId",
            params: {
              communityId: message.communityIdentifier,
              channelId: message.channelIdentifier,
            },
            search: { m: parentUuid, t: params.messageId },
            replace: true,
          });
        }

        throw redirect({
          to: "/$communityId/$channelId",
          params: {
            communityId: message.communityIdentifier,
            channelId: message.channelIdentifier,
          },
          search: { m: params.messageId },
          replace: true,
        });
      }

      if (message.conversationIdentifier) {
        const parentUuid = uuidFromIriOrObject(message.parent);
        if (parentUuid) {
          throw redirect({
            to: "/dm/$conversationId",
            params: { conversationId: message.conversationIdentifier },
            search: { m: parentUuid, t: params.messageId },
            replace: true,
          });
        }

        throw redirect({
          to: "/dm/$conversationId",
          params: { conversationId: message.conversationIdentifier },
          search: { m: params.messageId },
          replace: true,
        });
      }

      return { available: false } as const;
    } catch (err) {
      if (err instanceof ApiError) {
        return { available: false } as const;
      }
      throw err;
    }
  },
  component: MessageResolver,
});

function MessageResolver() {
  const { t } = useTranslation("channel");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <h1 className="text-lg font-semibold text-fg dark:text-white">
        {t("message_unavailable_title")}
      </h1>
      <p className="max-w-md text-sm text-fg-muted">{t("message_unavailable_body")}</p>
      <Link
        to="/"
        className="rounded-lg bg-accent-gradient px-3 py-1.5 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
      >
        {t("back_to_app")}
      </Link>
    </main>
  );
}
