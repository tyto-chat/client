import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const setVoiceMode = vi.fn();
const setPttKey = vi.fn();

vi.mock("@/context/AudioCallContext", () => ({
  useAudioCall: () => ({
    voiceMode: "open",
    pttKey: " ",
    setVoiceMode,
    setPttKey,
  }),
}));
vi.mock("@/hooks/useVoiceEnabled", () => ({ useVoiceEnabled: () => true }));
vi.mock("@/hooks/useMicLevelMonitor", () => ({ useMicLevelMonitor: () => {} }));
vi.mock("@/hooks/useMediaDevices", () => ({ useMediaDevices: () => [] }));
vi.mock("@/components/CameraPreview", () => ({
  CameraPreview: () => <div data-testid="camera-preview-stub" />,
}));

import { VoiceVideoPanel } from "@/components/preferences/VoiceVideoPanel";

describe("VoiceVideoPanel", () => {
  it("renders voice mode options", () => {
    render(<VoiceVideoPanel />);
    expect(screen.getByTestId("voice-mode-open")).toBeInTheDocument();
    expect(screen.getByTestId("voice-mode-ptt")).toBeInTheDocument();
  });

  it("renders the camera preview before the blur picker", () => {
    render(<VoiceVideoPanel />);
    const preview = screen.getByTestId("camera-preview-stub");
    const blurButton = screen.getByText("Off");
    const position = preview.compareDocumentPosition(blurButton);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
