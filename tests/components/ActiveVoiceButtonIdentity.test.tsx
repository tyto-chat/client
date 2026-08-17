import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerIdentitySwitchHandler, setActiveIdentityKey } from "@/platform/activeIdentity";

const activeCall = {
  token: "tok",
  channel: { identifier: "general" },
  communityId: "my-community",
  liveKitUrl: "wss://lk.example",
  identityKey: "ia",
};

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a data-testid="router-link" {...props}>
      {children}
    </a>
  ),
  createFileRoute: () => () => ({}),
  useRouterState: () => ({ location: { pathname: "/" } }),
}));
vi.mock("@/context/AudioCallContext", () => ({
  useAudioCall: () => ({
    activeCall,
    leave: vi.fn(),
    isMuted: false,
    isDeafened: false,
    toggleMute: vi.fn(),
    toggleDeafen: vi.fn(),
    isCameraEnabled: false,
    setCameraEnabled: vi.fn(),
  }),
}));

import { ActiveVoiceButton } from "@/routes/_app";

describe("ActiveVoiceButton cross-identity return", () => {
  afterEach(() => {
    registerIdentitySwitchHandler(null);
    setActiveIdentityKey(null);
  });

  it("routes return-to-channel through an identity switch when the call belongs to another identity", () => {
    setActiveIdentityKey("ib");
    const handler = vi.fn().mockResolvedValue(undefined);
    registerIdentitySwitchHandler(handler);

    render(<ActiveVoiceButton />);
    fireEvent.click(screen.getByTitle("voice_in_call"));
    fireEvent.click(screen.getByText("return_to_channel"));

    expect(handler).toHaveBeenCalledWith("ia", {
      to: "/$communityId/$channelId",
      params: { communityId: "my-community", channelId: "general" },
    });
  });

  it("renders the plain link when the call belongs to the active identity", () => {
    setActiveIdentityKey("ia");

    render(<ActiveVoiceButton />);
    fireEvent.click(screen.getByTitle("voice_in_call"));

    expect(screen.getByText("return_to_channel").closest("[data-testid=router-link]")).toBeTruthy();
  });
});
