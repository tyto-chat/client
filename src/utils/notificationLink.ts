import type { AppNotification } from "@/types/api";
import { uuidFromIri } from "@/api/hydra";

export function navigationFromNotification(n: AppNotification):
  | { to: "/admin" }
  | {
      to: "/$communityId/$channelId";
      params: { communityId: string; channelId: string };
      search: { m?: string };
    } {
  if (n.type === "disk_pressure_purge") {
    return { to: "/admin" };
  }
  const messageUuid = uuidFromIri(n.messageIri ?? "") || undefined;
  return {
    to: "/$communityId/$channelId",
    params: { communityId: n.communityIdentifier, channelId: n.channelIdentifier },
    search: messageUuid ? { m: messageUuid } : {},
  };
}
