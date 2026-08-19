import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeIdentityRequest,
  getIdentityDisplayInfo,
  registerIdentityInfoProvider,
  registerIdentityRequestExecutor,
  registerIdentitySwitchHandler,
  requestIdentitySwitch,
} from "@/platform/activeIdentity";

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

describe("identity display info provider", () => {
  afterEach(() => {
    registerIdentityInfoProvider(null);
  });

  it("returns null when no provider is registered", () => {
    expect(getIdentityDisplayInfo("ia")).toBeNull();
  });

  it("returns the registered provider's result for the given identity key", () => {
    const provider = vi
      .fn()
      .mockReturnValue({ serverName: "Acme", origin: "https://acme.example.com" });
    registerIdentityInfoProvider(provider);

    expect(getIdentityDisplayInfo("ia")).toEqual({
      serverName: "Acme",
      origin: "https://acme.example.com",
    });
    expect(provider).toHaveBeenCalledWith("ia");
  });

  it("returns null again after the provider is unregistered", () => {
    registerIdentityInfoProvider(() => ({
      serverName: "Acme",
      origin: "https://acme.example.com",
    }));
    registerIdentityInfoProvider(null);

    expect(getIdentityDisplayInfo("ia")).toBeNull();
  });
});

describe("identity request executor", () => {
  afterEach(() => {
    registerIdentityRequestExecutor(null);
  });

  it("returns false when no executor is registered", async () => {
    await expect(executeIdentityRequest("ia", "/api/communities/a/channels/g/call")).resolves.toBe(
      false,
    );
  });

  it("invokes the registered executor with identity, path and init, returns true", async () => {
    const executor = vi.fn().mockResolvedValue(undefined);
    registerIdentityRequestExecutor(executor);

    const init = { method: "POST", keepalive: true };
    await expect(
      executeIdentityRequest("ib", "/api/communities/a/channels/g/call", init),
    ).resolves.toBe(true);
    expect(executor).toHaveBeenCalledWith("ib", "/api/communities/a/channels/g/call", init);
  });

  it("stops invoking after the executor is unregistered", async () => {
    const executor = vi.fn().mockResolvedValue(undefined);
    registerIdentityRequestExecutor(executor);
    registerIdentityRequestExecutor(null);

    await expect(executeIdentityRequest("ia", "/api/communities/a/channels/g/call")).resolves.toBe(
      false,
    );
    expect(executor).not.toHaveBeenCalled();
  });
});
