import type { PinLookup, PinnedAccount, PinnedIdentity } from "./credentials";
import type { KeyStore, KeyStoreScope } from "./keyStore";

export type PinCheck = "new" | "match" | "changed";
export type PinVerification = "unverified" | "verified" | "accepted_unverified" | "changed_blocked";

interface PinRecord extends PinnedAccount {
  verification: PinVerification;
  presented?: PinnedAccount;
}

interface StoredPin {
  key: string;
  generation: number;
  verification: PinVerification;
  presented?: { key: string; generation: number };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function sameAccount(a: PinnedAccount, b: PinnedAccount): boolean {
  return (
    a.generation === b.generation &&
    a.accountPublicKey.length === b.accountPublicKey.length &&
    a.accountPublicKey.every((byte, i) => byte === b.accountPublicKey[i])
  );
}

function encode(record: PinRecord): Uint8Array {
  const stored: StoredPin = {
    key: toBase64(record.accountPublicKey),
    generation: record.generation,
    verification: record.verification,
    ...(record.presented && {
      presented: {
        key: toBase64(record.presented.accountPublicKey),
        generation: record.presented.generation,
      },
    }),
  };
  return new TextEncoder().encode(JSON.stringify(stored));
}

function decode(data: Uint8Array): PinRecord {
  const stored = JSON.parse(new TextDecoder().decode(data)) as StoredPin;
  return {
    accountPublicKey: fromBase64(stored.key),
    generation: stored.generation,
    verification: stored.verification,
    ...(stored.presented && {
      presented: {
        accountPublicKey: fromBase64(stored.presented.key),
        generation: stored.presented.generation,
      },
    }),
  };
}

type PinChange<R> = (pin: PinRecord | undefined) => { next: PinRecord | null; result: R };

export class PinStore implements PinLookup {
  private readonly store: KeyStore;
  private readonly scope: KeyStoreScope;

  constructor(store: KeyStore, scope: KeyStoreScope) {
    this.store = store;
    this.scope = scope;
  }

  async has(userId: number): Promise<boolean> {
    return (await this.read(userId)) !== undefined;
  }

  async pinned(userId: number): Promise<PinnedIdentity | undefined> {
    const pin = await this.read(userId);
    return (
      pin && {
        accountPublicKey: pin.accountPublicKey,
        generation: pin.generation,
        blocked: pin.verification === "changed_blocked",
      }
    );
  }

  async verification(userId: number): Promise<PinVerification | undefined> {
    return (await this.read(userId))?.verification;
  }

  check(userId: number, accountPublicKey: Uint8Array, generation: number): Promise<PinCheck> {
    const presented = { accountPublicKey, generation };
    return this.change(userId, (pin) => {
      if (pin === undefined) return { next: null, result: "new" };
      if (sameAccount(pin, presented)) return { next: null, result: "match" };
      return { next: { ...pin, verification: "changed_blocked", presented }, result: "changed" };
    });
  }

  pin(userId: number, accountPublicKey: Uint8Array, generation: number): Promise<void> {
    return this.change(userId, (pin) => {
      if (pin !== undefined) throw new Error("this user is already pinned");
      return {
        next: { accountPublicKey, generation, verification: "unverified" },
        result: undefined,
      };
    });
  }

  markVerified(userId: number): Promise<void> {
    return this.change(userId, (pin) => {
      if (pin === undefined || pin.verification === "changed_blocked") {
        throw new Error("only a pinned, unchanged key can be marked verified");
      }
      return { next: { ...pin, verification: "verified" }, result: undefined };
    });
  }

  acceptChanged(userId: number, accountPublicKey: Uint8Array, generation: number): Promise<void> {
    return this.replace(userId, { accountPublicKey, generation }, "accepted_unverified");
  }

  replaceVerified(userId: number, accountPublicKey: Uint8Array, generation: number): Promise<void> {
    return this.replace(userId, { accountPublicKey, generation }, "verified");
  }

  private replace(
    userId: number,
    next: PinnedAccount,
    verification: PinVerification,
  ): Promise<void> {
    return this.change(userId, (pin) => {
      if (
        pin?.verification !== "changed_blocked" ||
        pin.presented === undefined ||
        !sameAccount(pin.presented, next)
      ) {
        throw new Error("only the changed key that was presented can replace a pin");
      }
      return { next: { ...next, verification }, result: undefined };
    });
  }

  private async read(userId: number): Promise<PinRecord | undefined> {
    const data = await this.store.getRecord(this.scope, "pins", String(userId));
    return data === null ? undefined : decode(data);
  }

  private change<R>(userId: number, decide: PinChange<R>): Promise<R> {
    return this.store.updateRecord(this.scope, "pins", String(userId), (data) => {
      const { next, result } = decide(data === null ? undefined : decode(data));
      return { data: next === null ? null : encode(next), result };
    });
  }
}
