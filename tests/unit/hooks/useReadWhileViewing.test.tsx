import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReadWhileViewing } from "@/hooks/useReadWhileViewing";

let visible = true;
let focused = true;

function setup(initialCount = 0) {
  const markRead = vi.fn();
  const view = renderHook(({ count }) => useReadWhileViewing(markRead, count), {
    initialProps: { count: initialCount },
  });
  return { markRead, rerender: (count: number) => view.rerender({ count }) };
}

describe("useReadWhileViewing", () => {
  beforeEach(() => {
    visible = true;
    focused = true;
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
      visible ? "visible" : "hidden",
    );
    vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing on its own when the conversation opens", () => {
    const { markRead } = setup(3);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("marks read at once when something arrives while the user is looking", () => {
    const { markRead, rerender } = setup(0);
    rerender(1);
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the count drops or stays the same", () => {
    const { markRead, rerender } = setup(2);
    rerender(2);
    rerender(0);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("waits for the user to come back when the window is not focused", () => {
    focused = false;
    const { markRead, rerender } = setup(0);
    rerender(1);
    rerender(2);
    expect(markRead).not.toHaveBeenCalled();

    focused = true;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("waits while the window is hidden, then marks read once it is shown and focused", () => {
    visible = false;
    const { markRead, rerender } = setup(0);
    rerender(1);

    visible = true;
    focused = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(markRead).not.toHaveBeenCalled();

    focused = true;
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("does not mark read on return when nothing arrived meanwhile", () => {
    const { markRead } = setup(0);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(markRead).not.toHaveBeenCalled();
  });
});
