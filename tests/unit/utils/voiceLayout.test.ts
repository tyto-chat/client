import { describe, it, expect } from "vitest";
import { selectVoiceLayout } from "@/utils/voiceLayout";
import type { VoiceTile } from "@/utils/voiceLayout";

const cam = (sid: string): VoiceTile => ({ sid, kind: "camera", userId: 1, name: "A" });
const screen = (sid: string): VoiceTile => ({ sid, kind: "screen", userId: 2, name: "B" });
const avatar = (sid: string): VoiceTile => ({ sid, kind: "avatar", userId: 3, name: "C" });

describe("selectVoiceLayout", () => {
  it("returns grid mode when no screen-share present", () => {
    const r = selectVoiceLayout([cam("c1"), avatar("a1")]);
    expect(r.mode).toBe("grid");
    expect(r.spotlightSid).toBeNull();
    expect(r.tiles).toHaveLength(2);
  });

  it("spotlights the screen-share when one is present", () => {
    const r = selectVoiceLayout([cam("c1"), screen("s1"), avatar("a1")]);
    expect(r.mode).toBe("spotlight");
    expect(r.spotlightSid).toBe("s1");
    expect(r.tiles).toHaveLength(3);
  });

  it("spotlights the first screen-share when several are present", () => {
    const r = selectVoiceLayout([screen("s1"), screen("s2")]);
    expect(r.mode).toBe("spotlight");
    expect(r.spotlightSid).toBe("s1");
  });

  it("handles an empty tile list", () => {
    const r = selectVoiceLayout([]);
    expect(r.mode).toBe("grid");
    expect(r.spotlightSid).toBeNull();
    expect(r.tiles).toHaveLength(0);
  });
});
