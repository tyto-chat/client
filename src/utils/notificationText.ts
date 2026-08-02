import type { TFunction } from "i18next";

type TFunc = TFunction<readonly ["notifications", "common"]>;

export interface NotificationTextInput {
  type: string;
  groupName?: string | null;
  authorName?: string;
  channelIdentifier?: string;
  reason?: string | null;
  actorIds?: number[] | null;
  messageCount?: number;
}

// The `mention` default is load-bearing: real mentions carry no server type.
export function notificationText(n: NotificationTextInput, t: TFunc): string {
  switch (n.type) {
    case "channel_moderator":
      return t("channel_moderator", { channel: n.channelIdentifier });
    case "channel_access":
      return t("channel_access", { channel: n.channelIdentifier });
    case "group_added":
      return t("group_added", { group: n.groupName });
    case "group_removed":
      return t("group_removed", { group: n.groupName });
    case "group_ownership_transferred":
      return t("group_ownership_transferred", { group: n.groupName });
    case "webhook_failed":
      return t("webhook_failed", { name: n.authorName });
    case "broadcast_mention":
      return t("broadcast_mention", { author: n.authorName, channel: n.channelIdentifier });
    case "report_filed":
      return t("report_filed");
    case "report_escalated":
      return t("report_escalated");
    case "report_resolved":
      return t("report_resolved");
    case "report_dismissed":
      return t("report_dismissed");
    case "warn":
      return t("mod_warn", { reason: n.reason ?? "" });
    case "timeout":
      return t("mod_timeout", { reason: n.reason ?? "" });
    case "ban":
      return t("mod_ban", { reason: n.reason ?? "" });
    case "server_ban":
      return t("mod_server_ban", { reason: n.reason ?? "" });
    case "timeout_lifted":
      return t("mod_timeout_lifted");
    case "ban_lifted":
      return t("mod_ban_lifted");
    case "server_ban_lifted":
      return t("mod_server_ban_lifted");
    case "appeal_filed":
      return t("appeal_filed", { author: n.authorName });
    case "appeal_upheld":
      return t("appeal_upheld", { reason: n.reason ?? "" });
    case "appeal_overturned":
      return t("appeal_overturned", { reason: n.reason ?? "" });
    case "disk_pressure_purge":
      return n.reason || t("disk_pressure_purge");
    case "channel_activity": {
      const actors = n.actorIds?.length ?? 1;
      const count = n.messageCount ?? 1;
      const channel = n.channelIdentifier;
      if (actors >= 4) return t("channel_activity_many", { channel });
      if (actors === 1 && count === 1) {
        return t("channel_activity_single", { author: n.authorName, channel });
      }
      if (actors === 1) {
        return t("channel_activity_single_multi", { author: n.authorName, channel, count });
      }
      return t("channel_activity_few", { author: n.authorName, count: actors - 1, channel });
    }
    default:
      return t("mention", { author: n.authorName, channel: n.channelIdentifier });
  }
}
