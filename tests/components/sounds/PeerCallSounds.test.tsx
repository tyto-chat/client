import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionState } from "livekit-client";
import { resetSoundAmbientForTests } from "@/sounds/soundAmbient";
import { setSoundPlayerForTests, type PlayOptions } from "@/sounds/soundPlayer";
import type { SoundName } from "@/sounds/soundSet";
import { resetSoundSettingsForTests } from "@/sounds/soundSettings";
import { resetSoundsForTests } from "@/sounds/sounds";

let mockIdentities: string[];
let mockConnectionState: ConnectionState;
let mockOwnIdentity: string;

vi.mock("@livekit/components-react", () => ({
  useParticipants: () => mockIdentities.map((identity) => ({ identity })),
  useConnectionState: () => mockConnectionState,
  useLocalParticipant: () => ({ localParticipant: { identity: mockOwnIdentity } }),
}));

import { PeerCallSounds } from "@/sounds/PeerCallSounds";

const QUIET = { volume: 0.6, scale: 0.45 };

let played: Array<[SoundName, PlayOptions]>;

function mount() {
  const view = render(
    <StrictMode>
      <PeerCallSounds />
    </StrictMode>,
  );
  return {
    ...view,
    update: () =>
      view.rerender(
        <StrictMode>
          <PeerCallSounds />
        </StrictMode>,
      ),
  };
}

describe("PeerCallSounds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    played = [];
    setSoundPlayerForTests({
      play: (name, options) => played.push([name, options]),
      setOutputDevice: () => undefined,
    });
    localStorage.clear();
    resetSoundSettingsForTests();
    resetSoundAmbientForTests();
    resetSoundsForTests();
    mockOwnIdentity = "user-1";
    mockIdentities = ["user-1", "user-2", "user-3"];
    mockConnectionState = ConnectionState.Connected;
  });

  afterEach(() => {
    vi.useRealTimers();
    setSoundPlayerForTests(null);
  });

  it("is silent for the people already in the room", () => {
    mockConnectionState = ConnectionState.Connecting;
    mockIdentities = [];
    const view = mount();
    mockConnectionState = ConnectionState.Connected;
    mockIdentities = ["user-1", "user-2", "user-3"];
    view.update();
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([]);
  });

  it("plays a quieter join when someone arrives", () => {
    const view = mount();
    mockIdentities = ["user-1", "user-2", "user-3", "user-4"];
    view.update();
    vi.advanceTimersByTime(299);
    expect(played).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(played).toEqual([["join", QUIET]]);
  });

  it("plays a quieter leave when someone goes", () => {
    const view = mount();
    mockIdentities = ["user-1", "user-3"];
    view.update();
    vi.advanceTimersByTime(300);
    expect(played).toEqual([["leave", QUIET]]);
  });

  it("plays one join for three arrivals at once", () => {
    const view = mount();
    mockIdentities = ["user-1", "user-2", "user-3", "user-4", "user-5", "user-6"];
    view.update();
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([["join", QUIET]]);
  });

  it("ignores participants that are not people", () => {
    const view = mount();
    mockIdentities = ["user-1", "user-2", "user-3", "bot-7"];
    view.update();
    mockIdentities = ["user-1", "user-2", "user-3"];
    view.update();
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([]);
  });

  it("ignores the user's own identity", () => {
    mockIdentities = ["user-2", "user-3"];
    const view = mount();
    mockIdentities = ["user-1", "user-2", "user-3"];
    view.update();
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([]);
  });

  it("is silent while reconnecting and takes a new baseline afterwards", () => {
    const view = mount();
    mockConnectionState = ConnectionState.Reconnecting;
    mockIdentities = [];
    view.update();
    vi.advanceTimersByTime(1000);
    mockConnectionState = ConnectionState.Connected;
    mockIdentities = ["user-1", "user-2", "user-3"];
    view.update();
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([]);
    mockIdentities = ["user-1", "user-2", "user-3", "user-4"];
    view.update();
    vi.advanceTimersByTime(300);
    expect(played).toEqual([["join", QUIET]]);
  });

  it("takes the list after reconnecting as the new baseline, even if people changed meanwhile", () => {
    const view = mount();
    mockConnectionState = ConnectionState.Reconnecting;
    view.update();
    mockConnectionState = ConnectionState.Connected;
    mockIdentities = ["user-1", "user-4"];
    view.update();
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([]);
  });

  it("cancels a pending sound when the room goes away", () => {
    const view = mount();
    mockIdentities = ["user-1", "user-2", "user-3", "user-4"];
    view.update();
    view.unmount();
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([]);
  });
});
