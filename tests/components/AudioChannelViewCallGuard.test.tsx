import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Channel } from "@/types/api";
import type { ReactNode } from "react";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ communityId: "beta" }),
}));
vi.mock("@/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openLogin: vi.fn(), openRegister: vi.fn() }),
}));
let mockAuthUser: { roles?: string[] } | null = null;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ token: "tok", user: mockAuthUser }) }));
vi.mock("@/api/livekit", () => ({ fetchLiveKitToken: vi.fn() }));
vi.mock("@/api/serverInfo", () => ({ getServerInfo: () => ({ liveKitUrl: "wss://example" }) }));
const participantsQuerySpy = vi.fn<(...args: unknown[]) => { data: unknown[] }>(() => ({
  data: [],
}));
vi.mock("@/hooks/useChannelParticipants", () => ({
  useChannelParticipantsQuery: (...args: unknown[]) => participantsQuerySpy(...args),
}));
let mockMembership: { hasMembership: boolean } | undefined = { hasMembership: true };
vi.mock("@/queries/membershipQueries", () => ({
  useCommunityMembership: () => ({ data: mockMembership }),
}));

let mockActiveCall: {
  communityId: string;
  channel: { identifier: string };
  identityKey?: string | null;
} | null = null;
const setCallSlot = vi.fn();
const join = vi.fn();
vi.mock("@/context/AudioCallContext", () => ({
  useAudioCall: () => ({ activeCall: mockActiveCall, join, setCallSlot }),
}));

const getActiveIdentityKey = vi.fn().mockReturnValue(null);
vi.mock("@/platform/activeIdentity", () => ({
  getActiveIdentityKey: () => getActiveIdentityKey(),
}));

import { AudioChannelView } from "@/components/AudioChannelView";

const channel: Channel = {
  "@id": "/api/channels/1",
  "@type": "Channel",
  id: 1,
  name: "General",
  identifier: "general",
  position: 0,
  section: {
    "@id": "/s/1",
    "@type": "ChannelSection",
    id: 1,
    name: "s",
    identifier: "s",
    position: 0,
  },
};

function renderView() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<AudioChannelView channel={channel} />, { wrapper });
}

describe("AudioChannelView cross-server call guard", () => {
  beforeEach(() => {
    mockActiveCall = null;
    mockAuthUser = null;
    mockMembership = { hasMembership: true };
    getActiveIdentityKey.mockReset().mockReturnValue(null);
    setCallSlot.mockClear();
    join.mockClear();
    participantsQuerySpy.mockClear();
  });

  it("does not render in-this-call UI and disables join for a same-slug call owned by another identity", () => {
    getActiveIdentityKey.mockReturnValue("ib");
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: "ia",
    };

    renderView();

    expect(setCallSlot).not.toHaveBeenCalled();
    expect(screen.getByText("already_in_call")).toBeInTheDocument();
    const joinButton = screen.getByText("join_voice").closest("button");
    expect(joinButton).toBeDisabled();
  });

  it("renders in-this-call UI when identity, community and channel all match", () => {
    getActiveIdentityKey.mockReturnValue("ia");
    mockActiveCall = {
      communityId: "beta",
      channel: { identifier: "general" },
      identityKey: "ia",
    };

    renderView();

    expect(setCallSlot).toHaveBeenCalled();
    expect(screen.queryByText("already_in_call")).not.toBeInTheDocument();
  });

  it("treats null identityKey on both sides as matching (web mode)", () => {
    mockActiveCall = {
      communityId: "beta",
      channel: { identifier: "general" },
      identityKey: null,
    };

    renderView();

    expect(setCallSlot).toHaveBeenCalled();
  });

  it("hides join UI and disables the participants fetch for a community non-member", () => {
    mockMembership = { hasMembership: false };

    renderView();

    expect(screen.getByText("voice_members_only")).toBeInTheDocument();
    expect(screen.queryByText("join_voice")).not.toBeInTheDocument();
    expect(participantsQuerySpy).toHaveBeenCalledWith("beta", "general", false);
  });

  it("keeps join UI for a global admin without a membership row", () => {
    mockMembership = { hasMembership: false };
    mockAuthUser = { roles: ["ROLE_ADMIN"] };

    renderView();

    expect(screen.queryByText("voice_members_only")).not.toBeInTheDocument();
    expect(screen.getByText("join_voice")).toBeInTheDocument();
    expect(participantsQuerySpy).toHaveBeenCalledWith("beta", "general", true);
  });

  it("does not treat a different community's same-slug call as this-call even for the same identity", () => {
    getActiveIdentityKey.mockReturnValue("ia");
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: "ia",
    };

    renderView();

    expect(setCallSlot).not.toHaveBeenCalled();
    expect(screen.getByText("already_in_call")).toBeInTheDocument();
  });
});
