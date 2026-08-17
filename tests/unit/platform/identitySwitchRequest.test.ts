import { afterEach, describe, expect, it, vi } from "vitest";
import { registerIdentitySwitchHandler, requestIdentitySwitch } from "@/platform/activeIdentity";

describe("requestIdentitySwitch", () => {
  afterEach(() => {
    registerIdentitySwitchHandler(null);
  });

  it("returns false when no handler is registered", async () => {
    await expect(requestIdentitySwitch("ia")).resolves.toBe(false);
  });

  it("invokes the registered handler with identity and target, returns true", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerIdentitySwitchHandler(handler);

    const target = {
      to: "/$communityId/$channelId",
      params: { communityId: "c", channelId: "ch" },
    };
    await expect(requestIdentitySwitch("ib", target)).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith("ib", target);
  });

  it("stops invoking after the handler is unregistered", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerIdentitySwitchHandler(handler);
    registerIdentitySwitchHandler(null);

    await expect(requestIdentitySwitch("ia")).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
