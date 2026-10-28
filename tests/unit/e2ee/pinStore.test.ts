import { beforeEach, describe, expect, it } from "vitest";
import type { KeyStore, KeyStoreScope } from "@/e2ee/keyStore";
import { PinStore } from "@/e2ee/pinStore";
import { memoryKeyStoreFactory } from "../../mocks/memoryKeyStore";

const scope: KeyStoreScope = {
  serverOrigin: "https://chat.example.org",
  serverUserId: 1,
  profileId: "p",
};
const otherAccount: KeyStoreScope = { ...scope, serverUserId: 2 };
const keyA = new Uint8Array(32).fill(1);
const keyB = new Uint8Array(32).fill(2);

let newKeyStore: () => KeyStore;
let pins: PinStore;

beforeEach(() => {
  newKeyStore = memoryKeyStoreFactory();
  pins = new PinStore(newKeyStore(), scope);
});

describe("PinStore", () => {
  it("pin_new_then_match", async () => {
    await expect(pins.check(7, keyA, 1)).resolves.toBe("new");
    await expect(pins.has(7)).resolves.toBe(false);

    await pins.pin(7, keyA, 1);

    await expect(pins.check(7, keyA, 1)).resolves.toBe("match");
    await expect(pins.verification(7)).resolves.toBe("unverified");
    await expect(pins.pinned(7)).resolves.toEqual({
      accountPublicKey: keyA,
      generation: 1,
      blocked: false,
    });
  });

  it("never replaces a pin through pin()", async () => {
    await pins.pin(7, keyA, 1);

    await expect(pins.pin(7, keyB, 2)).rejects.toThrow();
    expect((await pins.pinned(7))?.accountPublicKey).toEqual(keyA);
  });

  it("changed_account_key_blocks_until_verified_or_accepted", async () => {
    await pins.pin(7, keyA, 1);

    await expect(pins.check(7, keyB, 2)).resolves.toBe("changed");

    await expect(pins.verification(7)).resolves.toBe("changed_blocked");
    await expect(pins.pinned(7)).resolves.toEqual({
      accountPublicKey: keyA,
      generation: 1,
      blocked: true,
    });
    await expect(pins.markVerified(7)).rejects.toThrow();
    await expect(pins.check(7, keyA, 1)).resolves.toBe("match");
    await expect(pins.verification(7)).resolves.toBe("changed_blocked");
  });

  it("treats the same key under another generation as a change", async () => {
    await pins.pin(7, keyA, 1);

    await expect(pins.check(7, keyA, 2)).resolves.toBe("changed");
    await expect(pins.verification(7)).resolves.toBe("changed_blocked");
  });

  it("accept_changed_records_unverified", async () => {
    await pins.pin(7, keyA, 1);
    await pins.markVerified(7);
    await pins.check(7, keyB, 2);

    await pins.acceptChanged(7, keyB, 2);

    await expect(pins.verification(7)).resolves.toBe("accepted_unverified");
    await expect(pins.pinned(7)).resolves.toEqual({
      accountPublicKey: keyB,
      generation: 2,
      blocked: false,
    });
    await expect(pins.check(7, keyB, 2)).resolves.toBe("match");
  });

  it("only accepts the key that was actually presented", async () => {
    await pins.pin(7, keyA, 1);
    await pins.check(7, keyB, 2);
    const keyC = new Uint8Array(32).fill(3);

    await expect(pins.acceptChanged(7, keyC, 2)).rejects.toThrow();
    await expect(pins.replaceVerified(7, keyC, 2)).rejects.toThrow();
    await expect(pins.verification(7)).resolves.toBe("changed_blocked");
  });

  it("refuses to accept a change that was never presented", async () => {
    await pins.pin(7, keyA, 1);

    await expect(pins.acceptChanged(7, keyB, 2)).rejects.toThrow();
    expect((await pins.pinned(7))?.accountPublicKey).toEqual(keyA);
  });

  it("verified_after_safety_number_match", async () => {
    await pins.pin(7, keyA, 1);
    await pins.markVerified(7);
    await expect(pins.verification(7)).resolves.toBe("verified");

    await pins.check(7, keyB, 2);
    await pins.replaceVerified(7, keyB, 2);

    await expect(pins.verification(7)).resolves.toBe("verified");
    await expect(pins.pinned(7)).resolves.toEqual({
      accountPublicKey: keyB,
      generation: 2,
      blocked: false,
    });
  });

  it("has_true_after_pin_and_survives_reload", async () => {
    await pins.pin(7, keyA, 1);
    await pins.pin(8, keyB, 1);
    await pins.markVerified(8);
    await pins.check(7, keyB, 2);

    const reloaded = new PinStore(newKeyStore(), scope);

    await expect(reloaded.has(7)).resolves.toBe(true);
    await expect(reloaded.verification(7)).resolves.toBe("changed_blocked");
    await expect(reloaded.acceptChanged(7, keyB, 2)).resolves.toBeUndefined();
    await expect(reloaded.verification(8)).resolves.toBe("verified");
  });

  it("never lets a second window overwrite a pin it has not seen", async () => {
    const otherWindow = new PinStore(newKeyStore(), scope);
    await pins.pin(7, keyA, 1);

    await expect(otherWindow.pin(7, keyB, 1)).rejects.toThrow();
    await expect(otherWindow.check(7, keyA, 1)).resolves.toBe("match");
    expect((await otherWindow.pinned(7))?.accountPublicKey).toEqual(keyA);
  });

  it("sees a pin that another open window replaced", async () => {
    await pins.pin(7, keyA, 1);
    const otherWindow = new PinStore(newKeyStore(), scope);
    await expect(otherWindow.pinned(7)).resolves.toEqual({
      accountPublicKey: keyA,
      generation: 1,
      blocked: false,
    });

    await pins.check(7, keyB, 2);
    await pins.acceptChanged(7, keyB, 2);

    await expect(otherWindow.pinned(7)).resolves.toEqual({
      accountPublicKey: keyB,
      generation: 2,
      blocked: false,
    });
    await expect(otherWindow.verification(7)).resolves.toBe("accepted_unverified");
  });

  it("keeps each account's pins apart", async () => {
    await pins.pin(7, keyA, 1);

    const other = new PinStore(newKeyStore(), otherAccount);

    await expect(other.has(7)).resolves.toBe(false);
  });
});
