import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMessageGroups } from "@/hooks/useMessageGroups";
import { mockUser } from "../../fixtures";
import type { MessageGroupData } from "@/utils/messageGroups";
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
const d = msg("d", "2026-05-20T10:02:00Z");

function summary(groups: MessageGroupData[]) {
  return groups.map((g) => [g.blocked, g.msgs.map((m) => m.id)]);
}

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
    expect(summary(result.current.groups)).toEqual([
      [true, ["a"]],
      [false, ["b", "c"]],
    ]);
  });

  it("reveals the focus target even when it is not first", () => {
    const { result, rerender } = renderHook(
      ({ focus }) => useMessageGroups([b, c], mockUser, focus),
      { initialProps: { focus: c["@id"] as string | null } },
    );
    expect(summary(result.current.groups)).toEqual([
      [true, ["b"]],
      [false, ["c"]],
    ]);
    rerender({ focus: null });
    expect(summary(result.current.groups)).toEqual([
      [true, ["b"]],
      [false, ["c"]],
    ]);
  });

  it("matches a bare uuid focus against the message IRI suffix", () => {
    const { result } = renderHook(() => useMessageGroups([b, c], mockUser, "c"));
    expect(summary(result.current.groups)).toEqual([
      [true, ["b"]],
      [false, ["c"]],
    ]);
  });

  it("keeps messages that arrive after Show collapsed", () => {
    const { result, rerender } = renderHook(({ list }) => useMessageGroups(list, mockUser), {
      initialProps: { list: [b, c] },
    });
    act(() => result.current.reveal(result.current.groups[0]!.msgs));
    rerender({ list: [b, c, d] });
    expect(summary(result.current.groups)).toEqual([
      [false, ["b", "c"]],
      [true, ["d"]],
    ]);
  });

  it("keeps the clicked messages revealed after older pages merge and newer ones arrive", () => {
    const { result, rerender } = renderHook(({ list }) => useMessageGroups(list, mockUser), {
      initialProps: { list: [b, c] },
    });
    act(() => result.current.reveal(result.current.groups[0]!.msgs));
    rerender({ list: [a, b, c, d] });
    expect(summary(result.current.groups)).toEqual([
      [true, ["a"]],
      [false, ["b", "c"]],
      [true, ["d"]],
    ]);
  });
});
