import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AudioCallProvider, useAudioCall } from "@/context/AudioCallContext";
import { setActiveIdentityKey } from "@/platform/activeIdentity";
import type { Channel } from "@/types/api";

const channel = { identifier: "general" } as Channel;

function Probe({ onReady }: { onReady: (ctx: ReturnType<typeof useAudioCall>) => void }) {
  onReady(useAudioCall());
  return null;
}

describe("AudioCallContext identity stamp", () => {
  afterEach(() => {
    setActiveIdentityKey(null);
    sessionStorage.clear();
  });

  it("stamps the active identity key onto the call state at join", () => {
    setActiveIdentityKey("ia");
    let ctx: ReturnType<typeof useAudioCall> | null = null;
    render(
      <AudioCallProvider>
        <Probe onReady={(value) => (ctx = value)} />
      </AudioCallProvider>,
    );

    act(() => {
      ctx!.join("tok", channel, "my-community", "wss://lk.example");
    });

    expect(ctx!.activeCall?.identityKey).toBe("ia");
  });

  it("stamps null in web mode where no identity is active", () => {
    let ctx: ReturnType<typeof useAudioCall> | null = null;
    render(
      <AudioCallProvider>
        <Probe onReady={(value) => (ctx = value)} />
      </AudioCallProvider>,
    );

    act(() => {
      ctx!.join("tok", channel, "my-community", "wss://lk.example");
    });

    expect(ctx!.activeCall?.identityKey).toBeNull();
  });
});
