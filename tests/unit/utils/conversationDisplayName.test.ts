import { describe, it, expect } from "vitest";
import { compactParticipantList, conversationDisplayName } from "@/utils/conversationDisplayName";
import type { Conversation, ConversationMember } from "@/types/api";

function member(userId: number, name: string | null): ConversationMember {
  return {
    "@id": `/api/conversation_members/${userId}`,
    "@type": "ConversationMember",
    id: userId,
    userId,
    profile: name
      ? {
          "@id": `/api/profiles/${userId}`,
          "@type": "UserProfile",
          name,
          avatar: null,
        }
      : null,
    joinedAt: "2026-01-01T00:00:00Z",
    mutedUntil: null,
    lastReadAt: null,
  } as unknown as ConversationMember;
}

const overflow = (n: number) => `+${n}`;

describe("compactParticipantList", () => {
  it('returns "—" when there are no other members', () => {
    expect(compactParticipantList([member(1, "me")], 1, overflow)).toBe("—");
  });

  it("returns a comma-joined list when within the cap", () => {
    expect(
      compactParticipantList([member(1, "me"), member(2, "Alice"), member(3, "Bob")], 1, overflow),
    ).toBe("Alice, Bob");
  });

  it("compacts overflow past the 2-name cap", () => {
    const ms = [member(1, "me"), member(2, "A"), member(3, "B"), member(4, "C"), member(5, "D")];
    expect(compactParticipantList(ms, 1, overflow)).toBe("A, B +2");
  });

  it("falls back to #userId when profile is missing", () => {
    expect(compactParticipantList([member(1, "me"), member(2, null)], 1, overflow)).toBe("#2");
  });
});

describe("conversationDisplayName", () => {
  it("delegates to compactParticipantList", () => {
    const conv = { members: [member(1, "me"), member(2, "Alice")] } as Conversation;
    expect(conversationDisplayName(conv, 1, overflow)).toBe("Alice");
  });
});
