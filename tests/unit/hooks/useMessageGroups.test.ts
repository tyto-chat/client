import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMessageGroups } from "@/hooks/useMessageGroups";
import { mockUser } from "../../fixtures";
import type { Message, User } from "@/types/api";

vi.mock("@/queries/blockQueries", () => ({ useBlockedUserIds: () => new Set([7]) }));

const blockedAuthor = {
  "@id": "/api/users/7",
  "@type": "User",
  id: 7,
  email: "b@b",
  roles: ["ROLE_USER"],
  profile: { "@id": "/api/profiles/7", "@type": "UserProfile", name: "B", avatar: null },
} as User;

function msg(id: string, createdAt: string): Message {
  return {
    "@id": `/api/messages/${id}`,
    "@type": "Message",
    id,
    text: id,
    isDeleted: false,
    edited: false,
    kind: "standard",
    createdAt,
    createdBy: blockedAuthor,
    reactions: null,
    pageNumber: 1,
  } as Message;
}

const a = msg("a", "2026-05-20T08:00:00Z");
const b = msg("b", "2026-05-20T10:00:00Z");
const c = msg("c", "2026-05-20T10:01:00Z");

describe("useMessageGroups", () => {
  it("collapses a blocked run into one blocked group", () => {
    const { result } = renderHook(() => useMessageGroups([b, c], mockUser));
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0]?.blocked).toBe(true);
  });

  it("regroups revealed messages with the normal time window", () => {
    const { result } = renderHook(() => useMessageGroups([a, b, c], mockUser));
    act(() => result.current.reveal(result.current.groups[0]!.msgs));
    expect(result.current.groups.map((g) => g.blocked)).toEqual([false, false]);
    expect(result.current.groups.map((g) => g.msgs.map((m) => m.id))).toEqual([["a"], ["b", "c"]]);
  });

  it("keeps a run revealed when older messages merge in front", () => {
    const { result, rerender } = renderHook(({ list }) => useMessageGroups(list, mockUser), {
      initialProps: { list: [b, c] },
    });
    act(() => result.current.reveal(result.current.groups[0]!.msgs));
    rerender({ list: [a, b, c] });
    expect(result.current.groups.every((g) => !g.blocked)).toBe(true);
  });

  it("reveals the run that holds the focus target even when it is not first", () => {
    const { result, rerender } = renderHook(
      ({ focus }) => useMessageGroups([b, c], mockUser, focus),
      { initialProps: { focus: c["@id"] as string | null } },
    );
    expect(result.current.groups.every((g) => !g.blocked)).toBe(true);
    rerender({ focus: null });
    expect(result.current.groups.every((g) => !g.blocked)).toBe(true);
  });

  it("matches a bare uuid focus against the message IRI suffix", () => {
    const { result } = renderHook(() => useMessageGroups([b, c], mockUser, "c"));
    expect(result.current.groups.every((g) => !g.blocked)).toBe(true);
  });
});
