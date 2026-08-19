import { describe, expect, it, vi } from "vitest";
import { applyMicrophoneEnabled, type MicParticipant } from "@/utils/micControl";

function participant(overrides: Partial<Record<keyof MicParticipant, unknown>>): MicParticipant {
  return {
    setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    getTrackPublication: vi.fn().mockReturnValue(undefined),
    unpublishTrack: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MicParticipant;
}

describe("applyMicrophoneEnabled", () => {
  it("reports success when the first attempt works", async () => {
    const p = participant({});
    await expect(applyMicrophoneEnabled(p, true)).resolves.toBe(true);
    expect(p.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    expect(p.unpublishTrack).not.toHaveBeenCalled();
  });

  it("republishes a dead microphone track when enabling fails, then reports success", async () => {
    const track = { sid: "TR_1" };
    const setMicrophoneEnabled = vi
      .fn()
      .mockRejectedValueOnce(new Error("device lost"))
      .mockResolvedValueOnce(undefined);
    const p = participant({
      setMicrophoneEnabled,
      getTrackPublication: vi.fn().mockReturnValue({ track }),
    });

    await expect(applyMicrophoneEnabled(p, true)).resolves.toBe(true);
    expect(p.unpublishTrack).toHaveBeenCalledWith(track);
    expect(setMicrophoneEnabled).toHaveBeenCalledTimes(2);
  });

  it("reports failure when the repair attempt also fails", async () => {
    const p = participant({
      setMicrophoneEnabled: vi.fn().mockRejectedValue(new Error("device lost")),
      getTrackPublication: vi.fn().mockReturnValue({ track: { sid: "TR_1" } }),
    });

    await expect(applyMicrophoneEnabled(p, true)).resolves.toBe(false);
  });

  it("does not attempt a republish when muting fails", async () => {
    const p = participant({
      setMicrophoneEnabled: vi.fn().mockRejectedValue(new Error("nope")),
    });

    await expect(applyMicrophoneEnabled(p, false)).resolves.toBe(false);
    expect(p.unpublishTrack).not.toHaveBeenCalled();
    expect(p.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
  });
});
