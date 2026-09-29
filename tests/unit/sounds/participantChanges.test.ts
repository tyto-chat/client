import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PEER_SOUND_WINDOW_MS,
  callKey,
  countChanges,
  createPeerSoundCoalescer,
  peerIdentities,
} from "@/sounds/participantChanges";

describe("participantChanges", () => {
  let emitted: Array<"peer-join" | "peer-leave">;
  let coalescer: ReturnType<typeof createPeerSoundCoalescer>;

  beforeEach(() => {
    vi.useFakeTimers();
    emitted = [];
    coalescer = createPeerSoundCoalescer((event) => emitted.push(event));
  });

  afterEach(() => {
    coalescer.cancel();
    vi.useRealTimers();
  });

  it("keeps only other people", () => {
    expect(peerIdentities(["user-1", "user-2", "bot-7", "ingress-x"], "user-1")).toEqual(
      new Set(["user-2"]),
    );
  });

  it("counts who came and who went", () => {
    expect(
      countChanges(new Set(["user-2", "user-3"]), new Set(["user-3", "user-4", "user-5"])),
    ).toEqual({ joined: 2, left: 1 });
  });

  it("waits the whole window before emitting", () => {
    expect(PEER_SOUND_WINDOW_MS).toBe(300);
    coalescer.report({ joined: 1, left: 0 });
    vi.advanceTimersByTime(299);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(emitted).toEqual(["peer-join"]);
  });

  it("emits one join for several arrivals inside the window", () => {
    coalescer.report({ joined: 1, left: 0 });
    vi.advanceTimersByTime(200);
    coalescer.report({ joined: 2, left: 0 });
    vi.advanceTimersByTime(100);
    expect(emitted).toEqual(["peer-join"]);
  });

  it("emits join then leave when both happened", () => {
    coalescer.report({ joined: 1, left: 1 });
    vi.advanceTimersByTime(300);
    expect(emitted).toEqual(["peer-join", "peer-leave"]);
  });

  it("emits nothing for no change, and nothing after cancel", () => {
    coalescer.report({ joined: 0, left: 0 });
    coalescer.report({ joined: 1, left: 0 });
    coalescer.cancel();
    vi.advanceTimersByTime(1000);
    expect(emitted).toEqual([]);
  });

  it("starts a fresh window after emitting", () => {
    coalescer.report({ joined: 1, left: 0 });
    vi.advanceTimersByTime(300);
    coalescer.report({ joined: 0, left: 1 });
    vi.advanceTimersByTime(300);
    expect(emitted).toEqual(["peer-join", "peer-leave"]);
  });

  it("names a call by server, community and channel", () => {
    expect(
      callKey({ identityKey: "i1", communityId: "owls", channel: { identifier: "voice" } }),
    ).toBe("i1:owls:voice");
    expect(callKey(null)).toBeNull();
  });

  it("names a web call without a server identity", () => {
    expect(
      callKey({ identityKey: null, communityId: "owls", channel: { identifier: "voice" } }),
    ).toBe(":owls:voice");
  });
});
