import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CameraPreview } from "@/components/CameraPreview";

let blurLevel: "off" | "light" | "strong" = "strong";
let resolveSetProcessor: (() => void) | null = null;
let emitProcessedFrame: (() => void) | null = null;

const track = {
  attach: vi.fn(),
  detach: vi.fn(),
  stop: vi.fn(),
  stopProcessor: vi.fn().mockResolvedValue(undefined),
  getProcessor: vi.fn().mockReturnValue(null),
  setProcessor: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveSetProcessor = () => resolve();
      }),
  ),
};

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

vi.mock("livekit-client", () => ({
  createLocalVideoTrack: vi.fn().mockImplementation(() => Promise.resolve(track)),
}));

vi.mock("@livekit/track-processors", () => ({
  BackgroundProcessor: vi.fn((options: { onFrameProcessed?: () => void }) => {
    emitProcessedFrame = () => options.onFrameProcessed?.();
    return { switchTo: vi.fn().mockResolvedValue(undefined) };
  }),
  supportsBackgroundProcessors: () => true,
}));

vi.mock("@/utils/deviceSettings", () => ({ usePreferredDevice: () => "" }));

vi.mock("@/utils/mediaEffects", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBackgroundBlur: () => blurLevel,
  useMirrorSelf: () => false,
}));

describe("CameraPreview", () => {
  beforeEach(() => {
    resolveSetProcessor = null;
    emitProcessedFrame = null;
    track.attach.mockClear();
    track.setProcessor.mockClear();
    blurLevel = "strong";
  });

  it("keeps the feed hidden until blurred frames are actually flowing", async () => {
    render(<CameraPreview />);

    await waitFor(() => expect(track.setProcessor).toHaveBeenCalled());
    expect(track.attach).not.toHaveBeenCalled();
    expect(screen.getByText("camera_preview_starting")).toBeInTheDocument();

    resolveSetProcessor?.();
    await waitFor(() => expect(emitProcessedFrame).not.toBeNull());

    emitProcessedFrame?.();
    await waitFor(() => expect(screen.getByText("camera_preview_starting")).toBeInTheDocument());
    expect(track.attach).not.toHaveBeenCalled();

    emitProcessedFrame?.();

    await waitFor(() => expect(track.attach).toHaveBeenCalled());
    expect(screen.queryByText("camera_preview_starting")).not.toBeInTheDocument();
  });

  it("reveals the feed anyway when the processor never reports a frame", async () => {
    vi.useFakeTimers();
    try {
      render(<CameraPreview />);
      await vi.waitFor(() => expect(track.setProcessor).toHaveBeenCalled());
      resolveSetProcessor?.();
      await vi.advanceTimersByTimeAsync(5000);
      await vi.waitFor(() => expect(track.attach).toHaveBeenCalled());
    } finally {
      vi.useRealTimers();
    }
  });

  it("attaches straight away when blur is off", async () => {
    blurLevel = "off";
    render(<CameraPreview />);

    await waitFor(() => expect(track.attach).toHaveBeenCalled());
    expect(track.setProcessor).not.toHaveBeenCalled();
  });
});
