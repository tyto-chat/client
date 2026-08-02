import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { resetSpeakingUsers, setSpeakingUsers, useSpeakingUsers } from "@/utils/speakingUsers";

describe("speakingUsers", () => {
  afterEach(() => {
    act(() => resetSpeakingUsers());
  });

  it("exposes the current speakers", () => {
    const { result } = renderHook(() => useSpeakingUsers());
    act(() => setSpeakingUsers(new Set([1, 2])));
    expect([...result.current].sort()).toEqual([1, 2]);
  });

  it("does not notify when membership is unchanged", () => {
    const listener = vi.fn();
    const { result } = renderHook(() => {
      listener();
      return useSpeakingUsers();
    });
    act(() => setSpeakingUsers(new Set([1])));
    const afterFirst = listener.mock.calls.length;

    act(() => setSpeakingUsers(new Set([1])));
    expect(listener.mock.calls.length).toBe(afterFirst);
    expect(result.current.has(1)).toBe(true);
  });

  it("notifies when membership changes", () => {
    const { result } = renderHook(() => useSpeakingUsers());
    act(() => setSpeakingUsers(new Set([1])));
    act(() => setSpeakingUsers(new Set([1, 2])));
    expect(result.current.has(2)).toBe(true);
  });

  it("clears on reset", () => {
    const { result } = renderHook(() => useSpeakingUsers());
    act(() => setSpeakingUsers(new Set([1])));
    act(() => resetSpeakingUsers());
    expect(result.current.size).toBe(0);
  });
});
