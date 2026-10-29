import { beforeEach, describe, expect, it } from "vitest";
import type { KeyStore, KeyStoreScope } from "@/e2ee/keyStore";
import {
  LocalSecurityState,
  decodeSecurityBackupEntry,
  type SecurityBackupEntry,
} from "@/e2ee/localSecurityState";
import { PinStore } from "@/e2ee/pinStore";
import { memoryKeyStoreFactory } from "../../mocks/memoryKeyStore";

const scope: KeyStoreScope = {
  serverOrigin: "https://chat.example.org",
  serverUserId: 1,
  profileId: "p",
};

let deviceA: KeyStore;
let deviceB: KeyStore;

beforeEach(() => {
  deviceA = memoryKeyStoreFactory()();
  deviceB = memoryKeyStoreFactory()();
});

async function backupEntries(store: KeyStore): Promise<SecurityBackupEntry[]> {
  return (await store.pendingBackupRecords(scope))
    .map(decodeSecurityBackupEntry)
    .filter((entry): entry is SecurityBackupEntry => entry !== null);
}

describe("LocalSecurityState", () => {
  it("starts with the refusal off and nothing accepted", async () => {
    const state = await LocalSecurityState.open(deviceA, scope);

    expect(state.snapshot().refusal).toEqual({ on: false, since: 0 });
    expect(state.snapshot().acceptedPlainConversations.size).toBe(0);
  });

  it("turning the refusal on stores the known messages and survives a reload", async () => {
    const state = await LocalSecurityState.open(deviceA, scope);

    await state.turnRefusalOn([{ id: "m1", revisionCount: 2 }]);

    const reloaded = await LocalSecurityState.open(deviceA, scope);
    expect(reloaded.snapshot().refusal).toEqual({ on: true, since: 1 });
    expect(reloaded.snapshot().knownBeforeRefusal.get("m1")).toBe(2);
  });

  it("turning the refusal on twice keeps the first known set", async () => {
    const state = await LocalSecurityState.open(deviceA, scope);
    await state.turnRefusalOn([{ id: "m1", revisionCount: 1 }]);

    await state.turnRefusalOn([{ id: "m2", revisionCount: 1 }]);

    expect(state.snapshot().knownBeforeRefusal.has("m1")).toBe(true);
    expect(state.snapshot().knownBeforeRefusal.has("m2")).toBe(false);
    expect(state.snapshot().refusal.since).toBe(1);
  });

  it("only the user turns the refusal off", async () => {
    const state = await LocalSecurityState.open(deviceA, scope);
    await state.turnRefusalOn([]);

    await state.turnRefusalOff();

    expect(state.snapshot().refusal).toEqual({ on: false, since: 2 });
  });

  it("refusal_synced_to_other_device_through_history_backup", async () => {
    const a = await LocalSecurityState.open(deviceA, scope);
    const b = await LocalSecurityState.open(deviceB, scope);
    await a.turnRefusalOn([{ id: "seen-on-a", revisionCount: 1 }]);
    await a.acceptPlainConversation(42);

    for (const entry of await backupEntries(deviceA)) {
      await b.applyBackupEntry(entry, () => [{ id: "seen-on-b", revisionCount: 3 }]);
    }

    expect(b.snapshot().refusal).toEqual({ on: true, since: 1 });
    expect(b.snapshot().knownBeforeRefusal.get("seen-on-b")).toBe(3);
    expect(b.snapshot().knownBeforeRefusal.has("seen-on-a")).toBe(false);
    expect(b.snapshot().acceptedPlainConversations.has(42)).toBe(true);
    expect(await backupEntries(deviceB)).toEqual([]);
  });

  it("an older backup entry does not undo a newer local choice", async () => {
    const a = await LocalSecurityState.open(deviceA, scope);
    await a.turnRefusalOn([]);
    await a.turnRefusalOff();
    await a.turnRefusalOn([]);

    await a.applyBackupEntry({ kind: "refusal", on: false, since: 2 }, () => []);

    expect(a.snapshot().refusal).toEqual({ on: true, since: 3 });
  });

  it("a tie between devices resolves to the stricter choice", async () => {
    const a = await LocalSecurityState.open(deviceA, scope);
    await a.turnRefusalOn([]);
    await a.turnRefusalOff();

    await a.applyBackupEntry({ kind: "refusal", on: true, since: 2 }, () => []);

    expect(a.snapshot().refusal.on).toBe(true);
  });

  it("accepting a plain conversation is idempotent and backed up once", async () => {
    const a = await LocalSecurityState.open(deviceA, scope);

    await a.acceptPlainConversation(7);
    await a.acceptPlainConversation(7);

    expect(a.snapshot().acceptedPlainConversations.has(7)).toBe(true);
    expect(await backupEntries(deviceA)).toEqual([{ kind: "acceptedPlain", conversationId: 7 }]);
  });

  it("knows the pinned peers and refreshes them", async () => {
    const a = await LocalSecurityState.open(deviceA, scope);
    expect(a.snapshot().pinnedUserIds.has(9)).toBe(false);

    await new PinStore(deviceA, scope).pin(9, new Uint8Array(32).fill(1), 1);
    await a.refreshPins();

    expect(a.snapshot().pinnedUserIds.has(9)).toBe(true);
  });

  it("tells subscribers about every change", async () => {
    const a = await LocalSecurityState.open(deviceA, scope);
    const seen: boolean[] = [];
    a.subscribe(() => seen.push(a.snapshot().refusal.on));

    await a.turnRefusalOn([]);
    await a.turnRefusalOff();

    expect(seen).toEqual([true, false]);
  });

  it("ignores backup entries it does not understand", () => {
    expect(decodeSecurityBackupEntry(new TextEncoder().encode('{"kind":"key"}'))).toBeNull();
    expect(decodeSecurityBackupEntry(new TextEncoder().encode("not json"))).toBeNull();
  });
});

describe("pin refresh", () => {
  it("does not notify when the pinned set did not change", async () => {
    const a = await LocalSecurityState.open(deviceA, scope);
    let calls = 0;
    a.subscribe(() => (calls += 1));

    await a.refreshPins();

    expect(calls).toBe(0);
  });
});
