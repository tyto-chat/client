import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SwitchingScreen } from "@/components/SwitchingScreen";
import { setIdentitySwitchInProgress, setIdentitySwitchTarget } from "@/platform/activeIdentity";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/ConversationsSidebar", () => ({
  ConversationsSidebar: () => <div data-testid="dm-sidebar" />,
}));

afterEach(() => {
  setIdentitySwitchTarget(null);
  setIdentitySwitchInProgress(false);
});

function renderScreen() {
  render(<SwitchingScreen />);
}

describe("switching screen", () => {
  it("keeps the real conversations sidebar when switching to a DM", () => {
    setIdentitySwitchInProgress(true);
    setIdentitySwitchTarget({ to: "/dm/$conversationId", params: { conversationId: "c1" } });

    renderScreen();

    expect(screen.getByTestId("dm-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("channel-sidebar-skeleton")).not.toBeInTheDocument();
  });

  it("shows the channel sidebar skeleton for non-DM targets", () => {
    setIdentitySwitchInProgress(true);
    setIdentitySwitchTarget({ to: "/$communityId", params: { communityId: "c" } });

    renderScreen();

    expect(screen.getByTestId("channel-sidebar-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("dm-sidebar")).not.toBeInTheDocument();
  });
});
