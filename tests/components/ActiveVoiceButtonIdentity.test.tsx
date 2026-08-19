import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerIdentityInfoProvider,
  registerIdentitySwitchHandler,
  setActiveIdentityKey,
} from "@/platform/activeIdentity";

const activeCall = {
  token: "tok",
  channel: { identifier: "general", name: "General Voice" },
  communityId: "my-community",
  liveKitUrl: "wss://lk.example",
  identityKey: "ia",
};

let mockCommunities: { id: number; identifier: string; name: string }[] = [];

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
vi.mock("@/queries/communityQueries", () => ({
  useCommunities: () => ({ data: mockCommunities }),
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
  beforeEach(() => {
    mockCommunities = [{ id: 1, identifier: "my-community", name: "My Community" }];
  });

  afterEach(() => {
    registerIdentitySwitchHandler(null);
    registerIdentityInfoProvider(null);
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

  it("shows the community and server line when an identity info provider is registered", () => {
    setActiveIdentityKey("ia");
    registerIdentityInfoProvider((identityKey) =>
      identityKey === "ia"
        ? { serverName: "Acme Server", origin: "https://acme.example.com" }
        : null,
    );

    render(<ActiveVoiceButton />);
    fireEvent.click(screen.getByTitle("voice_in_call"));

    expect(screen.getByText("My Community · Acme Server")).toBeTruthy();
  });

  it("falls back to the origin host when the provider has no server name", () => {
    setActiveIdentityKey("ia");
    registerIdentityInfoProvider(() => ({ serverName: null, origin: "https://acme.example.com" }));

    render(<ActiveVoiceButton />);
    fireEvent.click(screen.getByTitle("voice_in_call"));

    expect(screen.getByText("My Community · acme.example.com")).toBeTruthy();
  });

  it("shows the community name alone when no identity info provider is registered", () => {
    setActiveIdentityKey("ia");

    render(<ActiveVoiceButton />);
    fireEvent.click(screen.getByTitle("voice_in_call"));

    expect(screen.getByText("My Community")).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it("shows the channel name rather than its slug", () => {
    setActiveIdentityKey("ia");

    render(<ActiveVoiceButton />);
    fireEvent.click(screen.getByTitle("voice_in_call"));

    expect(screen.getByText("#General Voice")).toBeTruthy();
  });

  it("falls back to the community identifier when the community is not in the local list", () => {
    setActiveIdentityKey("ia");
    mockCommunities = [];

    render(<ActiveVoiceButton />);
    fireEvent.click(screen.getByTitle("voice_in_call"));

    expect(screen.getByText("my-community")).toBeTruthy();
  });
});
