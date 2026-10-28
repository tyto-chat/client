import { describe, expect, it } from "vitest";
import {
  createCredentialValidator,
  deviceCredentialPayload,
  revocationPayload,
  verifyCredential,
  type PinnedAccount,
} from "@/e2ee/credentials";
import { PinStore } from "@/e2ee/pinStore";
import { SERVER, ed25519Key, signedDevice } from "../../mocks/e2eeKeys";
import { memoryKeyStoreFactory } from "../../mocks/memoryKeyStore";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const asciiHex = (text: string) => hex(new TextEncoder().encode(text));

const context = { conversationId: 3, expectedUserIds: [7, 8] };

function validatorFor(pinned: Map<number, PinnedAccount>, revoked: string[] = []) {
  return createCredentialValidator({
    server: SERVER,
    pins: {
      pinned: async (userId) => {
        const pin = pinned.get(userId);
        return pin && { ...pin, blocked: false };
      },
    },
    revocations: {
      isRevoked: async (r) => revoked.includes(`${r.accountId}/${r.deviceId}/${r.generation}`),
    },
  });
}

describe("signed payloads", () => {
  it("encodes a device credential exactly like the server", () => {
    const payload = deviceCredentialPayload({
      server: "https://chat.example",
      accountId: 7,
      deviceId: "0b8f6f3e-6c1e-4a59-9a3d-2f0f5b8c1d2e",
      generation: 1,
      devicePublicKey: new Uint8Array(32).fill(0xaa),
    });

    expect(hex(payload)).toBe(
      "a5667365727665727468747470733a2f2f636861742e6578616d706c65" +
        "6864657669636549647824" +
        asciiHex("0b8f6f3e-6c1e-4a59-9a3d-2f0f5b8c1d2e") +
        "696163636f756e74496407" +
        "6a67656e65726174696f6e01" +
        "6f6465766963655075626c69634b65795820" +
        "aa".repeat(32),
    );
  });

  it("encodes a revocation exactly like the server", () => {
    const payload = revocationPayload({
      deviceId: "0b3e6e1c-2f43-4a59-9d6e-4c1f5a7b8c9d",
      generation: 2,
      revokedAt: 1_800_000_123,
      signerDeviceId: "5d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    });

    expect(hex(payload)).toBe(
      "a4686465766963654964782430623365366531632d326634332d346135392d396436652d346331663561376238633964697265766f6b656441741a6b49d27b6a67656e65726174696f6e026e7369676e65724465766963654964782435643163326233612d346535662d346136622d386337642d396530663161326233633464",
    );
  });

  it("encodes long strings and large integers in the shortest form", () => {
    const payload = deviceCredentialPayload({
      server: "s".repeat(300),
      accountId: 70_000,
      deviceId: "d",
      generation: 2 ** 33,
      devicePublicKey: new Uint8Array(0),
    });

    expect(hex(payload)).toContain("79012c" + "73".repeat(300));
    expect(hex(payload)).toContain(asciiHex("accountId") + "1a00011170");
    expect(hex(payload)).toContain(asciiHex("generation") + "1b0000000200000000");
  });

  it("refuses values the server could not have signed", () => {
    expect(() =>
      revocationPayload({ deviceId: "d", generation: 1, revokedAt: 1.5, signerDeviceId: "s" }),
    ).toThrow();
    expect(() =>
      revocationPayload({ deviceId: "d", generation: -1, revokedAt: 1, signerDeviceId: "s" }),
    ).toThrow();
  });
});

describe("verifyCredential", () => {
  it("valid_credential_accepted", async () => {
    const account = await ed25519Key();
    const { credential } = await signedDevice(account);

    await expect(
      verifyCredential(account.publicKey, credential, { server: SERVER, accountId: 7 }),
    ).resolves.toBe(true);
  });

  it("credential_signed_by_other_key_rejected", async () => {
    const account = await ed25519Key();
    const other = await ed25519Key();
    const { credential } = await signedDevice(other);

    await expect(
      verifyCredential(account.publicKey, credential, { server: SERVER, accountId: 7 }),
    ).resolves.toBe(false);
  });

  it("credential_for_other_server_rejected", async () => {
    const account = await ed25519Key();
    const { credential } = await signedDevice(account, { server: "https://evil.example" });

    await expect(
      verifyCredential(account.publicKey, credential, { server: SERVER, accountId: 7 }),
    ).resolves.toBe(false);
  });

  it("credential_for_other_account_rejected", async () => {
    const account = await ed25519Key();
    const { credential } = await signedDevice(account, { accountId: 9 });

    await expect(
      verifyCredential(account.publicKey, credential, { server: SERVER, accountId: 7 }),
    ).resolves.toBe(false);
  });

  it("rejects a credential whose signed fields were altered", async () => {
    const account = await ed25519Key();
    const { credential } = await signedDevice(account);
    const swapped = { ...credential, deviceId: crypto.randomUUID() };

    await expect(
      verifyCredential(account.publicKey, swapped, { server: SERVER, accountId: 7 }),
    ).resolves.toBe(false);
  });

  it("rejects malformed keys and signatures instead of throwing", async () => {
    const account = await ed25519Key();
    const { credential } = await signedDevice(account);

    await expect(
      verifyCredential(new Uint8Array(5), credential, { server: SERVER, accountId: 7 }),
    ).resolves.toBe(false);
    await expect(
      verifyCredential(
        account.publicKey,
        { ...credential, signature: new Uint8Array(3) },
        { server: SERVER, accountId: 7 },
      ),
    ).resolves.toBe(false);
  });
});

describe("credential validator", () => {
  it("accepts a credential that chains to the pinned key", async () => {
    const account = await ed25519Key();
    const { credential } = await signedDevice(account);
    const validate = validatorFor(
      new Map([[7, { accountPublicKey: account.publicKey, generation: 1 }]]),
    );

    await expect(validate(credential, context)).resolves.toBe("ok");
  });

  it("credential_with_old_generation_rejected", async () => {
    const account = await ed25519Key();
    const { credential } = await signedDevice(account, { generation: 1 });
    const validate = validatorFor(
      new Map([[7, { accountPublicKey: account.publicKey, generation: 2 }]]),
    );

    await expect(validate(credential, context)).resolves.toBe("chain_invalid");
  });

  it("names the failing rule for server, participant, pin and revocation", async () => {
    const account = await ed25519Key();
    const pinned = new Map([[7, { accountPublicKey: account.publicKey, generation: 1 }]]);
    const foreign = await signedDevice(account, { server: "https://evil.example" });
    const outsider = await signedDevice(account, { accountId: 9 });
    const unpinned = await signedDevice(account, { accountId: 8 });
    const revoked = await signedDevice(account);
    const validate = validatorFor(pinned, [`7/${revoked.credential.deviceId}/1`]);

    await expect(validate(foreign.credential, context)).resolves.toBe("wrong_server");
    await expect(validate(outsider.credential, context)).resolves.toBe("not_a_participant");
    await expect(validate(unpinned.credential, context)).resolves.toBe("unpinned");
    await expect(validate(revoked.credential, context)).resolves.toBe("revoked");
  });

  it("revoked_credential_rejected_under_new_device_id", async () => {
    const account = await ed25519Key();
    const revoked = await signedDevice(account);
    const validate = validatorFor(
      new Map([[7, { accountPublicKey: account.publicKey, generation: 1 }]]),
      [`7/${revoked.credential.deviceId}/1`],
    );
    const relabelled = { ...revoked.credential, deviceId: crypto.randomUUID() };

    await expect(validate(revoked.credential, context)).resolves.toBe("revoked");
    await expect(validate(relabelled, context)).resolves.toBe("chain_invalid");
  });

  it("rejects the old key while the account's identity change is unresolved", async () => {
    const oldAccount = await ed25519Key();
    const newAccount = await ed25519Key();
    const pins = new PinStore(memoryKeyStoreFactory()(), {
      serverOrigin: SERVER,
      serverUserId: 1,
      profileId: "p",
    });
    const validate = createCredentialValidator({
      server: SERVER,
      pins,
      revocations: { isRevoked: async () => false },
    });
    const { credential } = await signedDevice(oldAccount);
    await pins.pin(7, oldAccount.publicKey, 1);
    await expect(validate(credential, context)).resolves.toBe("ok");

    await pins.check(7, newAccount.publicKey, 2);
    await expect(validate(credential, context)).resolves.toBe("identity_changed");

    await pins.acceptChanged(7, newAccount.publicKey, 2);
    const fresh = await signedDevice(newAccount, { generation: 2 });
    await expect(validate(credential, context)).resolves.toBe("chain_invalid");
    await expect(validate(fresh.credential, context)).resolves.toBe("ok");
  });
});
