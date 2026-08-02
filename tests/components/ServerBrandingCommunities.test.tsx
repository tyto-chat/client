import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { ServerBranding } from "@/components/ServerBranding";
import type { ServerInfo } from "@/types/api";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <a onClick={onClick}>{children}</a>
  ),
}));

function serverInfo(overrides: Partial<ServerInfo> = {}): ServerInfo {
  return {
    name: "Testland",
    description: "A test server",
    apiUrl: "",
    mercureUrl: "",
    liveKitUrl: "",
    voiceEnabled: false,
    webPushPublicKey: "",
    uploads: null,
    communities: [
      {
        id: 1,
        identifier: "alpha",
        name: "Alpha",
        isPrivate: false,
        description: "First community",
        accentColor: null,
        logo: null,
      },
      {
        id: 2,
        identifier: "hidden",
        name: "Hidden",
        isPrivate: true,
        accentColor: null,
        logo: null,
      },
    ] as ServerInfo["communities"],
    communityStats: {
      alpha: { memberCount: 4, onlineCount: 2, channelCount: 3 },
    },
    registrationEnabled: true,
    hasTerms: false,
    hasPrivacy: false,
    requireLegalConsent: false,
    legalContactEmail: null,
    minimumAgeYears: 0,
    archivedChannelRetentionDays: 0,
    listInServerCatalogue: false,
    adminOnboardingComplete: true,
    ...overrides,
  };
}

async function openBrowser() {
  await userEvent.click(screen.getByRole("button", { name: /Browse 1 public community/ }));
}

describe("public communities browser", () => {
  it("shows per-community stats and hides private communities", async () => {
    render(<ServerBranding serverInfo={serverInfo()} />);
    await openBrowser();

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.getByText("4 members")).toBeInTheDocument();
    expect(screen.getByText("2 online")).toBeInTheDocument();
    expect(screen.getByText("3 channels")).toBeInTheDocument();
  });

  it("browse-as-guest closes the browser and notifies the host modal", async () => {
    const onNavigate = vi.fn();
    render(<ServerBranding serverInfo={serverInfo()} onNavigate={onNavigate} />);
    await openBrowser();

    await userEvent.click(screen.getByText("Browse as guest"));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Browse as guest")).not.toBeInTheDocument();
  });

  it("shows the register call-to-action only when registration is enabled", async () => {
    const onRegister = vi.fn();
    const { unmount } = render(
      <ServerBranding serverInfo={serverInfo()} onRegister={onRegister} />,
    );
    await openBrowser();
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(onRegister).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <ServerBranding
        serverInfo={serverInfo({ registrationEnabled: false })}
        onRegister={onRegister}
      />,
    );
    await openBrowser();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });
});
