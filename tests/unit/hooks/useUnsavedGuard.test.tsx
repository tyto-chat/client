import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";

const blockerSpy = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (opts: unknown) => blockerSpy(opts),
}));

afterEach(() => blockerSpy.mockClear());

describe("useUnsavedGuard", () => {
  it("registers a blocker disabled when not dirty", () => {
    renderHook(() => useUnsavedGuard(false));
    expect(blockerSpy).toHaveBeenCalled();
    const opts = blockerSpy.mock.calls[0]![0] as { disabled?: boolean };
    expect(opts.disabled).toBe(true);
  });

  it("enables the blocker when dirty", () => {
    renderHook(() => useUnsavedGuard(true));
    const opts = blockerSpy.mock.calls.at(-1)![0] as { disabled?: boolean };
    expect(opts.disabled).toBe(false);
  });

  it("adds and removes a beforeunload listener when dirty", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useUnsavedGuard(true));
    expect(add).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    unmount();
    expect(remove).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    add.mockRestore();
    remove.mockRestore();
  });
});
