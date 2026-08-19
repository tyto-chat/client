import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppSkeleton, ChannelSidebarSkeleton, MessagePaneSkeleton } from "@/components/ui/Skeleton";

describe("Skeleton compositions", () => {
  it("MessagePaneSkeleton renders header, message rows and composer", () => {
    render(<MessagePaneSkeleton />);
    const pane = screen.getByTestId("message-pane-skeleton");
    expect(pane).toBeInTheDocument();
    expect(pane.querySelectorAll("[data-skeleton-row]").length).toBeGreaterThanOrEqual(6);
    expect(pane.querySelector("[data-skeleton-composer]")).not.toBeNull();
  });

  it("MessagePaneSkeleton hides the composer when disabled", () => {
    render(<MessagePaneSkeleton composer={false} />);
    const pane = screen.getByTestId("message-pane-skeleton");
    expect(pane.querySelector("[data-skeleton-composer]")).toBeNull();
  });

  it("ChannelSidebarSkeleton renders channel rows", () => {
    render(<ChannelSidebarSkeleton />);
    const sidebar = screen.getByTestId("channel-sidebar-skeleton");
    expect(sidebar.querySelectorAll("[data-skeleton-row]").length).toBeGreaterThanOrEqual(5);
  });

  it("AppSkeleton composes rail, sidebar and message pane", () => {
    render(<AppSkeleton />);
    expect(screen.getByTestId("app-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("channel-sidebar-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("message-pane-skeleton")).toBeInTheDocument();
  });

  it("is inert for assistive tech and pauses with reduced motion", () => {
    render(<AppSkeleton />);
    const root = screen.getByTestId("app-skeleton");
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelector(".animate-pulse.motion-reduce\\:animate-none")).not.toBeNull();
  });
});
