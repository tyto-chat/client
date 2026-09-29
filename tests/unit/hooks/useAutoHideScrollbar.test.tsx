import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useAutoHideScrollbar } from "@/hooks/useAutoHideScrollbar";

function Panel() {
  const ref = useAutoHideScrollbar<HTMLDivElement>();
  return <div ref={ref} data-testid="panel" className="scrollbar-autohide" />;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoHideScrollbar", () => {
  it("keeps the scrollbar hidden until the panel is scrolled", () => {
    render(<Panel />);

    expect(screen.getByTestId("panel").classList.contains("scrolling")).toBe(false);
  });

  it("shows the scrollbar while scrolling and hides it shortly after", () => {
    render(<Panel />);
    const panel = screen.getByTestId("panel");

    fireEvent.scroll(panel);
    expect(panel.classList.contains("scrolling")).toBe(true);

    act(() => vi.advanceTimersByTime(1000));
    fireEvent.scroll(panel);
    act(() => vi.advanceTimersByTime(1000));
    expect(panel.classList.contains("scrolling")).toBe(true);

    act(() => vi.advanceTimersByTime(600));
    expect(panel.classList.contains("scrolling")).toBe(false);
  });
});
