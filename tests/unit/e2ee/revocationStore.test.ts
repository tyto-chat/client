import { beforeEach, describe, expect, it } from "vitest";
import type { PinnedIdentity } from "@/e2ee/credentials";
import type { KeyStore, KeyStoreScope } from "@/e2ee/keyStore";
import { RevocationStore } from "@/e2ee/revocationStore";
import {
  SERVER,
  ed25519Key,
  signedDevice,
  signedRevocation,
  type TestKey,
} from "../../mocks/e2eeKeys";
import { memoryKeyStoreFactory } from "../../mocks/memoryKeyStore";

const scope: KeyStoreScope = { serverOrigin: SERVER, serverUserId: 1, profileId: "p" };

let newKeyStore: () => KeyStore;
let account: TestKey;
let pinned: (userId: number) => Promise<PinnedIdentity | undefined>;

beforeEach(async () => {
  newKeyStore = memoryKeyStoreFactory();
  account = await ed25519Key();
  pinned = async (userId) =>
    userId === 7
      ? { accountPublicKey: account.publicKey, generation: 1, blocked: false }
      : undefined;
});

function open() {
  return new RevocationStore(newKeyStore(), scope, { server: SERVER, pins: { pinned } });
}

describe("RevocationStore", () => {
  it("server_supplied_revocation_list_merged_only_when_verified", async () => {
    const store = open();
    const sibling = await signedDevice(account);
    const target = await signedDevice(account);
    const stranger = await signedDevice(await ed25519Key());
    const genuine = await signedRevocation(sibling, target.credential);
    const forgedSigner = await signedRevocation(stranger, { deviceId: "x1", generation: 1 });
    const tampered = {
      ...(await signedRevocation(sibling, { deviceId: "x2", generation: 1 })),
      deviceId: "x3",
    };
    const foreignServer = {
      ...(await signedRevocation(sibling, { deviceId: "x4", generation: 1 })),
      signerServer: "https://evil.example",
    };

    const added = await store.merge(7, [genuine, forgedSigner, tampered, foreignServer]);

    expect(added).toBe(1);
    await expect(store.isRevoked({ ...target.credential, accountId: 7 })).resolves.toBe(true);
    for (const deviceId of ["x1", "x2", "x3", "x4"]) {
      await expect(store.isRevoked({ accountId: 7, deviceId, generation: 1 })).resolves.toBe(false);
    }
  });

  it("ignores revocations for an account that is not pinned", async () => {
    const store = open();
    const sibling = await signedDevice(account, { accountId: 8 });

    await expect(
      store.merge(8, [await signedRevocation(sibling, { deviceId: "x", generation: 1 })]),
    ).resolves.toBe(0);
    await expect(store.isRevoked({ accountId: 8, deviceId: "x", generation: 1 })).resolves.toBe(
      false,
    );
  });

  it("accepts a device's own signed leave request", async () => {
    const store = open();
    const leaving = await signedDevice(account);

    await store.merge(7, [await signedRevocation(leaving, leaving.credential)]);

    await expect(store.isRevoked({ ...leaving.credential, accountId: 7 })).resolves.toBe(true);
  });

  it("revocation_set_is_monotonic", async () => {
    const store = open();
    const sibling = await signedDevice(account);
    await store.merge(7, [await signedRevocation(sibling, { deviceId: "gone", generation: 1 })]);

    await store.merge(7, []);
    const reloaded = open();

    const gone = { accountId: 7, deviceId: "gone", generation: 1 };
    await expect(store.isRevoked(gone)).resolves.toBe(true);
    await expect(reloaded.isRevoked(gone)).resolves.toBe(true);
    await expect(reloaded.isRevoked({ ...gone, generation: 2 })).resolves.toBe(false);
  });

  it("counts a revocation it already holds as nothing new", async () => {
    const store = open();
    const sibling = await signedDevice(account);
    const revocation = await signedRevocation(sibling, { deviceId: "gone", generation: 1 });
    await store.merge(7, [revocation]);

    await expect(store.merge(7, [revocation])).resolves.toBe(0);
    await expect(open().merge(7, [revocation])).resolves.toBe(0);
  });

  it("reaches the same revoked set whatever order the revocations arrive in", async () => {
    const [keeper, middle, compromised] = await Promise.all([
      signedDevice(account),
      signedDevice(account),
      signedDevice(account),
    ]);
    const middleRevokesCompromised = await signedRevocation(
      middle,
      compromised.credential,
      1_800_000_100,
    );
    const keeperRevokesMiddle = await signedRevocation(keeper, middle.credential, 1_800_000_200);
    const deliveries = [
      [[middleRevokesCompromised, keeperRevokesMiddle]],
      [[keeperRevokesMiddle, middleRevokesCompromised]],
      [[keeperRevokesMiddle], [middleRevokesCompromised, keeperRevokesMiddle]],
      [[middleRevokesCompromised], [keeperRevokesMiddle]],
    ];

    for (const batches of deliveries) {
      newKeyStore = memoryKeyStoreFactory();
      const store = open();
      for (const batch of batches) await store.merge(7, batch);

      await expect(store.isRevoked({ ...compromised.credential, accountId: 7 })).resolves.toBe(
        true,
      );
      await expect(store.isRevoked({ ...middle.credential, accountId: 7 })).resolves.toBe(true);
    }
  });

  it("sees a revocation that another open window merged", async () => {
    const thisWindow = open();
    const otherWindow = open();
    const sibling = await signedDevice(account);
    const gone = { accountId: 7, deviceId: "gone", generation: 1 };
    await expect(thisWindow.isRevoked(gone)).resolves.toBe(false);

    await otherWindow.merge(7, [await signedRevocation(sibling, gone)]);

    await expect(thisWindow.isRevoked(gone)).resolves.toBe(true);
  });
});
