import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PresenceState } from "@/types/api";
import type { VoiceMode } from "@/utils/voiceSettings";
import { getSoundAmbient, resetSoundAmbientForTests } from "@/sounds/soundAmbient";
import { setSoundPlayerForTests } from "@/sounds/soundPlayer";
import type { SoundName } from "@/sounds/soundSet";
import { resetSoundSettingsForTests } from "@/sounds/soundSettings";
import { resetSoundsForTests } from "@/sounds/sounds";

interface MockCall {
  token: string;
  channel: { identifier: string };
  communityId: string;
  liveKitUrl: string;
  identityKey?: string | null;
}

let mockActiveCall: MockCall | null;
let mockIsMuted: boolean;
let mockVoiceMode: VoiceMode;
let mockPresence: PresenceState;
let presenceUserIds: Array<number | null | undefined>;

vi.mock("@/context/AudioCallContext", () => ({
  useAudioCall: () => ({
    activeCall: mockActiveCall,
    isMuted: mockIsMuted,
    voiceMode: mockVoiceMode,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({ user: { id: 7 } }),
}));

vi.mock("@/queries/presenceQueries", () => ({
  useUserPresence: (userId: number | null | undefined) => {
    presenceUserIds.push(userId);
    return mockPresence;
  },
}));

import { CallSounds } from "@/sounds/CallSounds";

let played: SoundName[];

function call(channel: string, overrides: Partial<MockCall> = {}): MockCall {
  return {
    token: "token-1",
    channel: { identifier: channel },
    communityId: "owls",
    liveKitUrl: "wss://lk.example",
    identityKey: null,
    ...overrides,
  };
}

function mount() {
  const view = render(
    <StrictMode>
      <CallSounds />
    </StrictMode>,
  );
  return {
    ...view,
    update: () =>
      view.rerender(
        <StrictMode>
          <CallSounds />
        </StrictMode>,
      ),
  };
}

describe("CallSounds", () => {
  beforeEach(() => {
    played = [];
    presenceUserIds = [];
    setSoundPlayerForTests({
      play: (name) => played.push(name),
      setOutputDevice: () => undefined,
    });
    localStorage.clear();
    resetSoundSettingsForTests();
    resetSoundAmbientForTests();
    resetSoundsForTests();
    mockActiveCall = null;
    mockIsMuted = false;
    mockVoiceMode = "open";
    mockPresence = "online";
  });

  afterEach(() => {
    setSoundPlayerForTests(null);
  });

  it("is silent on first render with no call", () => {
    mount();
    expect(played).toEqual([]);
  });

  it("is silent on first render when a call is already running", () => {
    mockActiveCall = call("voice");
    mockIsMuted = true;
    mount();
    expect(played).toEqual([]);
  });

  it("plays join when a call starts", () => {
    const view = mount();
    mockActiveCall = call("voice");
    view.update();
    expect(played).toEqual(["join"]);
  });

  it("plays leave when the call ends", () => {
    const view = mount();
    mockActiveCall = call("voice");
    view.update();
    mockActiveCall = null;
    view.update();
    expect(played).toEqual(["join", "leave"]);
  });

  it("plays only join when moving straight into another channel", () => {
    const view = mount();
    mockActiveCall = call("voice");
    view.update();
    mockActiveCall = call("lounge");
    view.update();
    expect(played).toEqual(["join", "join"]);
  });

  it("plays nothing when only the token or the server url of the same call changes", () => {
    mockActiveCall = call("voice", { identityKey: "i1" });
    const view = mount();
    mockActiveCall = call("voice", { identityKey: "i1", token: "token-2" });
    view.update();
    mockActiveCall = call("voice", {
      identityKey: "i1",
      token: "token-2",
      liveKitUrl: "wss://other.example",
    });
    view.update();
    expect(played).toEqual([]);
  });

  it("plays join when the same channel is joined under another server identity", () => {
    mockActiveCall = call("voice", { identityKey: "i1" });
    const view = mount();
    mockActiveCall = call("voice", { identityKey: "i2" });
    view.update();
    expect(played).toEqual(["join"]);
  });

  it("plays mute, then unmute", () => {
    const view = mount();
    mockActiveCall = call("voice");
    view.update();
    mockIsMuted = true;
    view.update();
    mockIsMuted = false;
    view.update();
    expect(played).toEqual(["join", "mute", "unmute"]);
  });

  it("plays no mute sound for the muted state a call starts with", () => {
    const view = mount();
    mockActiveCall = call("voice");
    mockIsMuted = true;
    view.update();
    expect(played).toEqual(["join"]);
  });

  it("plays no unmute sound when the call ends while muted", () => {
    const view = mount();
    mockActiveCall = call("voice");
    view.update();
    mockIsMuted = true;
    view.update();
    mockActiveCall = null;
    mockIsMuted = false;
    view.update();
    expect(played).toEqual(["join", "mute", "leave"]);
  });

  it("plays no mute sound outside a call", () => {
    const view = mount();
    mockIsMuted = true;
    view.update();
    expect(played).toEqual([]);
  });

  it("plays no unmute sound when switching to push-to-talk while muted", () => {
    const view = mount();
    mockActiveCall = call("voice");
    view.update();
    mockIsMuted = true;
    view.update();
    mockIsMuted = false;
    mockVoiceMode = "ptt";
    view.update();
    expect(played).toEqual(["join", "mute"]);
  });

  it("keeps the ambient store current", () => {
    const view = mount();
    expect(getSoundAmbient()).toEqual({ presence: "online", inCall: false, voiceMode: "open" });
    mockPresence = "dnd";
    mockActiveCall = call("voice");
    mockVoiceMode = "ptt";
    view.update();
    expect(getSoundAmbient()).toEqual({ presence: "dnd", inCall: true, voiceMode: "ptt" });
    expect(presenceUserIds).toContain(7);
  });

  it("resets the ambient store when it goes away", () => {
    mockPresence = "away";
    mockActiveCall = call("voice");
    mockVoiceMode = "ptt";
    const view = mount();
    expect(getSoundAmbient()).toEqual({ presence: "away", inCall: true, voiceMode: "ptt" });
    view.unmount();
    expect(getSoundAmbient()).toEqual({ presence: "online", inCall: false, voiceMode: "open" });
  });
});
