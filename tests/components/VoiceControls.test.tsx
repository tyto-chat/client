import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const setCameraEnabled = vi.fn();
const setScreenShareEnabled = vi.fn();
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@/context/AudioCallContext", () => ({
  useAudioCall: () => ({
    voiceMode: "open",
    pttKey: " ",
    isPttActive: false,
    isMuted: false,
    isDeafened: false,
    toggleMute: vi.fn(),
    toggleDeafen: vi.fn(),
    leave: vi.fn(),
    micLevelRef: { current: 0 },
    isCameraEnabled: false,
    isScreenShareEnabled: false,
    setCameraEnabled,
    setScreenShareEnabled,
  }),
}));

import { VoiceControls } from "@/components/AudioChannelView";

describe("VoiceControls media toggles", () => {
  it("camera button calls setCameraEnabled(true)", () => {
    render(<VoiceControls />);
    fireEvent.click(screen.getByTitle("camera_on"));
    expect(setCameraEnabled).toHaveBeenCalledWith(true);
  });

  it("screen button calls setScreenShareEnabled(true)", () => {
    render(<VoiceControls />);
    fireEvent.click(screen.getByTitle("screen_share_on"));
    expect(setScreenShareEnabled).toHaveBeenCalledWith(true);
  });
});
