import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(__dirname, "../../../src", path), "utf8");
}

function body(path: string, name: string): string {
  const text = source(path);
  const start = text.search(new RegExp(`export (async )?function ${name}\\b`));
  expect(start, `${name} in ${path}`).toBeGreaterThanOrEqual(0);
  const next = text.slice(start + 1).search(/\nexport /);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
}

const ADMISSION = /admit(PlainContent|Messages|Page|Replies)\(/;

describe("admission_called_on_every_cache_writing_path", () => {
  it.each([
    ["hooks/useMercure.ts", "useConversationMercure"],
    ["hooks/useMercure.ts", "useThreadMercure"],
    ["queries/conversationQueries.ts", "useInfiniteConversationMessages"],
    ["queries/threadQueries.ts", "useThreadReplies"],
    ["queries/threadQueries.ts", "useLoadEarlierReplies"],
    ["queries/messageQueries.ts", "useMessage"],
  ])("%s %s admits plain content before caching it", (path, name) => {
    expect(body(path, name)).toMatch(ADMISSION);
  });

  it("the DM route loader admits the first page and the focus target", () => {
    const loader = source("routes/_app/dm/$conversationId.tsx");
    expect(loader).toMatch(/admitPage\(\s*conversation,\s*await fetchConversationPage/);
    expect(loader).toMatch(/admitPlainContent\(conversation, target\)/);
  });
});

describe("plain writes are guarded on every write path", () => {
  it.each([
    ["queries/conversationQueries.ts", "useSendConversationMessage"],
    ["queries/conversationQueries.ts", "useEditConversationMessage"],
    ["queries/threadQueries.ts", "useReplyToMessage"],
    ["queries/threadQueries.ts", "useEditThreadReply"],
    ["queries/reactionQueries.ts", "useToggleThreadReaction"],
  ])("%s %s checks before writing", (path, name) => {
    expect(body(path, name)).toMatch(/assertPlainWriteAllowed\(|guardedToggle\(/);
  });

  it("conversation reactions and attachments are guarded", () => {
    expect(source("queries/reactionQueries.ts")).toMatch(
      /useToggleReactionForKey\(\s*queryKeys\.conversationPages\(identifier\),\s*currentUserId,\s*identifier,?\s*\)/,
    );
    expect(source("hooks/usePendingAttachments.ts")).toMatch(/assertPlainWriteAllowed\(/);
  });
});

describe("notification_gate_called_on_every_notification_path", () => {
  it.each([
    ["hooks/useUserNotificationsMercure.tsx", "useUserNotificationsMercure"],
    ["desktop/ConnectionNotificationBridge.tsx", "ConnectionNotificationBridge"],
  ])("%s %s asks the gate before toasting, caching or notifying", (path, name) => {
    const fn = body(path, name);
    const gate = fn.indexOf("allowNotification(");
    expect(gate).toBeGreaterThanOrEqual(0);
    for (const effect of ["notify(", "showDesktopNotification(", "setQueryData("]) {
      const at = fn.indexOf(effect);
      if (at >= 0) expect(at, `${effect} after the gate in ${name}`).toBeGreaterThan(gate);
    }
  });

  it("desktop notifications are only raised from gated paths", () => {
    const root = resolve(__dirname, "../../../src");
    const callers = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) =>
        readFileSync(resolve(root, file), "utf8").includes("showDesktopNotification("),
      )
      .map((file) => file.replaceAll("\\", "/"))
      .sort();

    expect(callers).toEqual([
      "desktop/ConnectionNotificationBridge.tsx",
      "hooks/useUserNotificationsMercure.tsx",
      "utils/desktopNotifications.ts",
      "utils/testNotification.ts",
    ]);
  });
});
