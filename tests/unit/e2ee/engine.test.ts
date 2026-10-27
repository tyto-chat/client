import { afterEach, describe, expect, it, vi } from "vitest";
import { createMlsEngine } from "@/e2ee/engineImpl";
import { isE2eeCapable } from "@/e2ee/isE2eeCapable";
import { createFakeMlsEngine } from "../../mocks/fakeMlsEngine";
import {
  BridgeVersionError,
  MLS_BRIDGE_VERSION,
  type BridgeMls,
  type BridgeMlsStaged,
  type PlatformBridge,
} from "@/platform/PlatformBridge";

const scope = { serverOrigin: "https://chat.example.org", serverUserId: 5, profileId: "p1" };

const credential = {
  server: scope.serverOrigin,
  accountId: 5,
  deviceId: "a0000000-0000-4000-8000-000000000001",
  generation: 1,
  devicePublicKey: new Uint8Array(32),
  signature: new Uint8Array(64),
};

const staged: BridgeMlsStaged = {
  id: "3f8b1c2e-0d4a-4b6c-9e7f-1a2b3c4d5e6f",
  groupId: "conv-1",
  commit: Uint8Array.of(1),
  groupInfo: Uint8Array.of(2),
  actor: credential,
  added: [],
  removed: [],
  resultingRoster: [{ credential, leafIndex: 0 }],
  newEpoch: 1,
  welcomes: [],
};

function bridgeWith(
  mls: Partial<BridgeMls> | undefined,
  bridgeVersion = MLS_BRIDGE_VERSION,
): PlatformBridge {
  return {
    bridgeVersion,
    secrets: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    config: { get: vi.fn(), set: vi.fn() },
    ...(mls === undefined ? {} : { mls: mls as BridgeMls }),
  };
}

afterEach(() => {
  delete window.__TYTO_PLATFORM__;
});

describe("createMlsEngine", () => {
  it("binds every engine call to the account scope", async () => {
    const createGroup = vi.fn().mockResolvedValue(staged);
    const encrypt = vi
      .fn()
      .mockResolvedValue({ state: Uint8Array.of(9), message: Uint8Array.of(8) });
    const engine = createMlsEngine(scope, bridgeWith({ createGroup, encrypt }));

    await engine.createGroup(Uint8Array.of(1), "conv-1");
    await engine.encrypt(Uint8Array.of(1), "conv-1", Uint8Array.of(7));

    expect(createGroup).toHaveBeenCalledWith(scope, Uint8Array.of(1), "conv-1");
    expect(encrypt).toHaveBeenCalledWith(scope, Uint8Array.of(1), "conv-1", Uint8Array.of(7));
  });

  it("merges and discards a stage by its id only", async () => {
    const merge = vi.fn().mockResolvedValue({ state: Uint8Array.of(3) });
    const discard = vi.fn().mockResolvedValue(undefined);
    const engine = createMlsEngine(scope, bridgeWith({ merge, discard }));

    expect(await engine.merge(staged)).toEqual({ state: Uint8Array.of(3) });
    await engine.discard(staged);

    expect(merge).toHaveBeenCalledWith(staged.id);
    expect(discard).toHaveBeenCalledWith(staged.id);
  });

  it("asks the shell to create the device key and never handles a private key", async () => {
    const createDeviceKey = vi.fn().mockResolvedValue({ devicePublicKey: new Uint8Array(32) });
    const generateDevice = vi.fn().mockResolvedValue({ state: Uint8Array.of(1) });
    const engine = createMlsEngine(scope, bridgeWith({ createDeviceKey, generateDevice }));

    await engine.createDeviceKey();
    await engine.generateDevice(credential);

    expect(createDeviceKey).toHaveBeenCalledWith(scope);
    expect(generateDevice).toHaveBeenCalledWith(scope, credential);
    expect(generateDevice.mock.calls[0]).toHaveLength(2);
  });

  it("surfaces an old desktop shell as a BridgeVersionError, not a crash", () => {
    expect(() => createMlsEngine(scope, bridgeWith(undefined, 2))).toThrow(BridgeVersionError);

    try {
      createMlsEngine(scope, bridgeWith({}, 2));
    } catch (error) {
      expect(error).toBeInstanceOf(BridgeVersionError);
      expect((error as BridgeVersionError).found).toBe(2);
      expect((error as BridgeVersionError).required).toBe(MLS_BRIDGE_VERSION);
    }
  });
});

describe("isE2eeCapable", () => {
  it("is false without an injected desktop bridge", () => {
    expect(isE2eeCapable()).toBe(false);
  });

  it("is false when the injected shell predates the MLS bridge", () => {
    window.__TYTO_PLATFORM__ = bridgeWith(undefined, 2);
    expect(isE2eeCapable()).toBe(false);
  });

  it("is true when the injected shell carries the MLS bridge", () => {
    window.__TYTO_PLATFORM__ = bridgeWith({});
    expect(isE2eeCapable()).toBe(true);
  });
});

describe("fake MLS engine", () => {
  const device = (accountId: number, deviceId: string) => ({ ...credential, accountId, deviceId });

  it("follows the real engine's staging, epoch and freshness rules", async () => {
    const alice = createFakeMlsEngine(device(1, "a"));
    const bob = createFakeMlsEngine(device(2, "b"));
    let aliceState = (await alice.generateDevice(device(1, "a"))).state;
    let bobState = (await bob.generateDevice(device(2, "b"))).state;
    const packages = await bob.createKeyPackages(bobState, 1, 3600);
    bobState = packages.state;

    const created = await alice.createGroup(aliceState, "conv-1");
    aliceState = (await alice.merge(created)).state;
    const added = await alice.addMembers(aliceState, "conv-1", packages.packages);
    await expect(alice.encrypt(aliceState, "conv-1", Uint8Array.of(1))).rejects.toThrow("pending");
    aliceState = (await alice.merge(added)).state;
    bobState = (await bob.merge(await bob.joinFromWelcome(bobState, added.welcomes[0]!))).state;

    const sent = await alice.encrypt(aliceState, "conv-1", Uint8Array.of(42));
    await expect(alice.encrypt(aliceState, "conv-1", Uint8Array.of(43))).rejects.toThrow("stale");
    const received = await bob.decrypt(bobState, "conv-1", sent.message);

    expect(Array.from(received.data)).toEqual([42]);
    expect(received.sender.deviceId).toBe("a");
    expect(added.added.map((m) => m.credential.deviceId)).toEqual(["b"]);
  });
});
