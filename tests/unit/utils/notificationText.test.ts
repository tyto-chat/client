import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { notificationText, type NotificationTextInput } from "@/utils/notificationText";

// Minimal fake t() that echoes the key + interpolation params, so we can assert
// the correct key/params are chosen without loading i18n resources.
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as never;

const realT = i18n.getFixedT("en", "notifications") as never;

const base: NotificationTextInput = { type: "", authorName: "Ann", channelIdentifier: "general" };

describe("notificationText", () => {
  it("renders group_ownership_transferred (previously fell through to mention)", () => {
    const text = notificationText(
      { ...base, type: "group_ownership_transferred", groupName: "Mods" },
      t,
    );
    expect(text).toBe('group_ownership_transferred:{"group":"Mods"}');
  });

  it("renders webhook_failed with the webhook name (previously fell through)", () => {
    const text = notificationText(
      { ...base, type: "webhook_failed", authorName: "Deploy hook" },
      t,
    );
    expect(text).toBe('webhook_failed:{"name":"Deploy hook"}');
  });

  it("renders moderation types instead of the mention default", () => {
    expect(notificationText({ ...base, type: "warn", reason: "spam" }, t)).toBe(
      'mod_warn:{"reason":"spam"}',
    );
    expect(notificationText({ ...base, type: "ban" }, t)).toBe('mod_ban:{"reason":""}');
  });

  it("renders dm_message instead of a channel-less mention (cross-server toast path)", () => {
    const text = notificationText({ ...base, type: "dm_message", channelIdentifier: "" }, t);
    expect(text).toBe('dm_message:{"author":"Ann"}');
    expect(notificationText({ ...base, type: "dm_message" }, realT)).not.toMatch(/#/);
  });

  it("still routes real mentions (no explicit type) to the mention default", () => {
    expect(notificationText({ ...base, type: "mention" }, t)).toBe(
      'mention:{"author":"Ann","channel":"general"}',
    );
  });

  it("renders disk_pressure_purge from the server reason", () => {
    const text = notificationText(
      {
        type: "disk_pressure_purge",
        reason: "Low disk space: deleted 3 attachment(s).",
      } as NotificationTextInput,
      t,
    );
    expect(text).toBe("Low disk space: deleted 3 attachment(s).");
  });

  it("falls back to the generic disk_pressure_purge text without a reason", () => {
    const text = notificationText({ type: "disk_pressure_purge" } as NotificationTextInput, realT);
    expect(text).toBe("Old attachments were removed automatically to free disk space");
  });
});
