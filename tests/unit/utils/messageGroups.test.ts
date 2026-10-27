import { describe, it, expect } from "vitest";
import { groupMessages, GROUP_THRESHOLD_MS } from "@/utils/messageGroups";
import { mockUser } from "../../fixtures";
import type { Message, User } from "@/types/api";

function msg(id: string, authorIri: string, when: string, opts: Partial<Message> = {}): Message {
  return {
    "@id": id,
    "@type": "Message",
    id,
    text: "x",
    isDeleted: false,
    edited: false,
    kind: "standard",
    createdAt: when,
    createdBy: {
      "@id": authorIri,
      "@type": "User",
      id: authorIri === mockUser["@id"] ? mockUser.id : 999,
      email: "x@x",
      roles: ["ROLE_USER"],
      profile: {
        "@id": authorIri,
        "@type": "UserProfile",
        name: "x",
        avatar: null,
      },
    } as unknown as User,
    reactions: null,
    pageNumber: 1,
    ...opts,
  };
}

const T0 = "2026-05-20T10:00:00Z";
const T_PLUS_4MIN = "2026-05-20T10:04:00Z";
const T_PLUS_6MIN = "2026-05-20T10:06:00Z";

describe("groupMessages", () => {
  it("returns [] for empty input", () => {
    expect(groupMessages([], null)).toEqual([]);
  });

  it("groups consecutive messages from same author within window", () => {
    const out = groupMessages(
      [msg("a", "/api/profiles/1", T0), msg("b", "/api/profiles/1", T_PLUS_4MIN)],
      null,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.msgs.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("splits group when window elapsed", () => {
    const out = groupMessages(
      [msg("a", "/api/profiles/1", T0), msg("b", "/api/profiles/1", T_PLUS_6MIN)],
      null,
    );
    expect(out).toHaveLength(2);
  });

  it("splits group on author change", () => {
    const out = groupMessages(
      [msg("a", "/api/profiles/1", T0), msg("b", "/api/profiles/2", T_PLUS_4MIN)],
      null,
    );
    expect(out).toHaveLength(2);
  });

  it("marks isOwn for current user's messages", () => {
    const out = groupMessages([msg("a", mockUser.profile["@id"], T0)], mockUser);
    expect(out[0]?.isOwn).toBe(true);
  });

  it("treats optimistic messages as own and groups with current user", () => {
    const optimistic = msg("optimistic-1", "/api/me", T0);
    const real = msg("real", mockUser.profile["@id"], T_PLUS_4MIN);
    const out = groupMessages([optimistic, real], mockUser);
    expect(out).toHaveLength(1);
    expect(out[0]?.isOwn).toBe(true);
  });

  it("marks groups of blocked authors and merges them across the time window", () => {
    const blocked = new Set([999]);
    const out = groupMessages(
      [
        msg("a", "/api/profiles/7", "2026-05-20T10:00:00Z"),
        msg("b", "/api/profiles/7", "2026-05-20T10:10:00Z"),
        msg("c", "/api/profiles/7", "2026-05-20T10:20:00Z"),
      ],
      mockUser,
      blocked,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.blocked).toBe(true);
    expect(out[0]?.msgs.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a blocked author's group separate from others", () => {
    const blocked = new Set([999]);
    const other = msg("b", "/api/profiles/8", T_PLUS_4MIN);
    other.createdBy = { ...other.createdBy!, id: 8 };
    const out = groupMessages(
      [msg("a", "/api/profiles/7", T0), other, msg("c", "/api/profiles/7", T_PLUS_6MIN)],
      mockUser,
      blocked,
    );
    expect(out.map((g) => g.blocked)).toEqual([true, false, true]);
    expect(out.map((g) => g.msgs.length)).toEqual([1, 1, 1]);
  });

  it("never marks a system message blocked", () => {
    const out = groupMessages(
      [msg("a", "/api/profiles/7", T0, { kind: "system" })],
      mockUser,
      new Set([999]),
    );
    expect(out[0]?.blocked).toBe(false);
  });

  it("marks nothing blocked without a set", () => {
    const out = groupMessages([msg("a", "/api/profiles/7", T0)], mockUser);
    expect(out[0]?.blocked).toBe(false);
  });

  it("GROUP_THRESHOLD_MS is 5 minutes", () => {
    expect(GROUP_THRESHOLD_MS).toBe(5 * 60 * 1000);
  });
});
