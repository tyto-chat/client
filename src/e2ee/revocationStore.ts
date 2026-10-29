import {
  verifyRevocation,
  type PinLookup,
  type RevocationLookup,
  type RevokedDevice,
  type SignedRevocation,
} from "./credentials";
import type { KeyStore, KeyStoreScope } from "./keyStore";

interface StoredRevocation {
  deviceId: string;
  generation: number;
  revokedAt: number;
  signerDeviceId: string;
  signature: string;
  signerPublicKey: string;
  signerCredential: string;
  signerServer: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function idOf(device: RevokedDevice): string {
  return JSON.stringify([device.accountId, device.deviceId, device.generation]);
}

function encode(revocation: SignedRevocation): Uint8Array {
  const stored: StoredRevocation = {
    deviceId: revocation.deviceId,
    generation: revocation.generation,
    revokedAt: revocation.revokedAt,
    signerDeviceId: revocation.signerDeviceId,
    signature: toBase64(revocation.signature),
    signerPublicKey: toBase64(revocation.signerPublicKey),
    signerCredential: toBase64(revocation.signerCredential),
    signerServer: revocation.signerServer,
  };
  return new TextEncoder().encode(JSON.stringify(stored));
}

export class RevocationStore implements RevocationLookup {
  private readonly store: KeyStore;
  private readonly scope: KeyStoreScope;
  private readonly options: { server: string; pins: PinLookup };

  constructor(store: KeyStore, scope: KeyStoreScope, options: { server: string; pins: PinLookup }) {
    this.store = store;
    this.scope = scope;
    this.options = options;
  }

  async isRevoked(device: RevokedDevice): Promise<boolean> {
    return (await this.store.getRecord(this.scope, "revocations", idOf(device))) !== null;
  }

  async merge(accountId: number, revocations: SignedRevocation[]): Promise<number> {
    const pin = await this.options.pins.pinned(accountId);
    if (pin === undefined) return 0;
    const fresh = new Map<string, SignedRevocation>();
    const signer = { server: this.options.server, accountId, pin };
    for (const revocation of revocations) {
      const target = {
        accountId,
        deviceId: revocation.deviceId,
        generation: revocation.generation,
      };
      const id = idOf(target);
      if (fresh.has(id) || (await this.isRevoked(target))) continue;
      if (await verifyRevocation(revocation, signer)) fresh.set(id, revocation);
    }
    if (fresh.size === 0) return 0;
    await this.store.putRecords(
      this.scope,
      "revocations",
      [...fresh].map(([id, revocation]) => ({ id, data: encode(revocation) })),
    );
    return fresh.size;
  }
}
