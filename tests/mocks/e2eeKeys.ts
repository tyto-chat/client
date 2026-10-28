import {
  deviceCredentialPayload,
  revocationPayload,
  type SignedRevocation,
} from "@/e2ee/credentials";
import type { Credential } from "@/e2ee/engine";

export interface TestKey {
  privateKey: CryptoKey;
  publicKey: Uint8Array;
}

export const SERVER = "https://chat.example.org";

export async function ed25519Key(): Promise<TestKey> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { privateKey: pair.privateKey, publicKey };
}

export async function sign(key: TestKey, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.sign({ name: "Ed25519" }, key.privateKey, new Uint8Array(data)),
  );
}

export async function signedDevice(
  account: TestKey,
  fields: Partial<Omit<Credential, "signature" | "devicePublicKey">> & { device?: TestKey } = {},
): Promise<{ credential: Credential; device: TestKey }> {
  const device = fields.device ?? (await ed25519Key());
  const unsigned = {
    server: fields.server ?? SERVER,
    accountId: fields.accountId ?? 7,
    deviceId: fields.deviceId ?? crypto.randomUUID(),
    generation: fields.generation ?? 1,
    devicePublicKey: device.publicKey,
  };
  const signature = await sign(account, deviceCredentialPayload(unsigned));
  return { credential: { ...unsigned, signature }, device };
}

export async function signedRevocation(
  signer: { credential: Credential; device: TestKey },
  revoked: { deviceId: string; generation: number },
  revokedAt = 1_800_000_000,
): Promise<SignedRevocation> {
  const fields = {
    deviceId: revoked.deviceId,
    generation: revoked.generation,
    revokedAt,
    signerDeviceId: signer.credential.deviceId,
  };
  return {
    ...fields,
    signature: await sign(signer.device, revocationPayload(fields)),
    signerPublicKey: signer.credential.devicePublicKey,
    signerCredential: signer.credential.signature,
    signerServer: signer.credential.server,
  };
}
