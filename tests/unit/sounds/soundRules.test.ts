import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_MIN_GAP_MS,
  decideCallSound,
  decideNotificationSound,
  MESSAGE_NOTIFICATION_TYPES,
  isMessageNotification,
  isNotificationOnScreen,
  soundForCallEvent,
  type NotificationSituation,
} from "@/sounds/soundRules";

describe("soundForCallEvent", () => {
  it.each([
    ["self-join", "join"],
    ["peer-join", "join"],
    ["self-leave", "leave"],
    ["peer-leave", "leave"],
    ["mute", "mute"],
    ["unmute", "unmute"],
  ] as const)("plays %s as %s", (event, sound) => {
    expect(soundForCallEvent(event)).toBe(sound);
  });
});

describe("decideCallSound", () => {
  const open = { enabled: true, voiceMode: "open" } as const;

  it.each([
    ["self-join", "play"],
    ["self-leave", "play"],
    ["mute", "play"],
    ["unmute", "play"],
    ["peer-join", "quiet"],
    ["peer-leave", "quiet"],
  ] as const)("decides %s as %s", (event, decision) => {
    expect(decideCallSound(event, open)).toBe(decision);
  });

  it("is silent for every call event when call sounds are off", () => {
    for (const event of [
      "self-join",
      "self-leave",
      "peer-join",
      "peer-leave",
      "mute",
      "unmute",
    ] as const) {
      expect(decideCallSound(event, { enabled: false, voiceMode: "open" })).toBe("silent");
    }
  });

  it("makes no mute or unmute sound in push-to-talk, and keeps the others", () => {
    const ptt = { enabled: true, voiceMode: "ptt" } as const;
    expect(decideCallSound("mute", ptt)).toBe("silent");
    expect(decideCallSound("unmute", ptt)).toBe("silent");
    expect(decideCallSound("self-join", ptt)).toBe("play");
    expect(decideCallSound("peer-leave", ptt)).toBe("quiet");
  });
});

describe("decideNotificationSound", () => {
  const calm: NotificationSituation = {
    enabled: true,
    presence: "online",
    snoozed: false,
    msSinceLastSound: null,
    onScreen: false,
    windowFocused: true,
    inCall: false,
  };

  it.each([
    [{}, "play"],
    [{ enabled: false }, "silent"],
    [{ presence: "dnd" as const }, "silent"],
    [{ presence: "away" as const }, "play"],
    [{ snoozed: true }, "silent"],
    [{ msSinceLastSound: 1999 }, "silent"],
    [{ msSinceLastSound: 2000 }, "play"],
    [{ onScreen: true, windowFocused: true }, "silent"],
    [{ onScreen: true, windowFocused: false }, "play"],
    [{ inCall: true }, "quiet"],
    [{ inCall: true, presence: "dnd" as const }, "silent"],
    [{ inCall: true, onScreen: true, windowFocused: false }, "quiet"],
  ])("decides %j as %s", (change, decision) => {
    expect(decideNotificationSound({ ...calm, ...change })).toBe(decision);
  });

  it("pins the minimum gap between notification sounds", () => {
    expect(NOTIFICATION_MIN_GAP_MS).toBe(2000);
  });
});

describe("isMessageNotification", () => {
  it("lists the message notification types", () => {
    expect(MESSAGE_NOTIFICATION_TYPES).toEqual([
      "dm_message",
      "mention",
      "broadcast_mention",
      "channel_activity",
    ]);
  });

  it.each(["dm_message", "mention", "broadcast_mention", "channel_activity"])(
    "treats %s as a message",
    (type) => {
      expect(isMessageNotification(type)).toBe(true);
    },
  );

  it.each(["report_filed", "group_added", "channel_access", "warn", "server_ban", "", "unknown"])(
    "does not treat %j as a message",
    (type) => {
      expect(isMessageNotification(type)).toBe(false);
    },
  );
});

describe("isNotificationOnScreen", () => {
  it.each([
    [
      { notificationType: "mention", sameServer: true, conversationIdentifier: "abc" },
      "/dm/abc",
      true,
    ],
    [
      { notificationType: "mention", sameServer: true, conversationIdentifier: "abc" },
      "/dm/abc/",
      true,
    ],
    [
      { notificationType: "mention", sameServer: true, conversationIdentifier: "abc" },
      "/dm/abcd",
      false,
    ],
    [
      { notificationType: "mention", sameServer: true, conversationIdentifier: "abc" },
      "/dm",
      false,
    ],
    [
      { notificationType: "mention", sameServer: false, conversationIdentifier: "abc" },
      "/dm/abc",
      false,
    ],
    [
      {
        notificationType: "mention",
        sameServer: true,
        communityIdentifier: "owls",
        channelIdentifier: "general",
      },
      "/owls/general",
      true,
    ],
    [
      {
        notificationType: "mention",
        sameServer: true,
        communityIdentifier: "owls",
        channelIdentifier: "general",
      },
      "/owls/random",
      false,
    ],
    [
      {
        notificationType: "mention",
        sameServer: true,
        communityIdentifier: "owls",
        channelIdentifier: "general",
      },
      "/other/general",
      false,
    ],
    [
      {
        notificationType: "mention",
        sameServer: true,
        communityIdentifier: "owls",
        channelIdentifier: "",
      },
      "/owls",
      false,
    ],
    [{ notificationType: "mention", sameServer: true }, "/owls/general", false],
    [
      {
        notificationType: "mention",
        sameServer: true,
        communityIdentifier: "dm",
        channelIdentifier: "abc",
      },
      "/dm/abc",
      false,
    ],
  ] as const)("matches %j against %s as %s", (target, pathname, expected) => {
    expect(isNotificationOnScreen(target, pathname)).toBe(expected);
  });
});
