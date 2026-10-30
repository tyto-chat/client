import { encodeCanonicalMap } from "./canonicalCbor";
import type { Credential, CredentialValidator, LeaveRequestFields, Revocation } from "./engine";

export type CredentialFields = Omit<Credential, "signature">;

export interface PinnedAccount {
  accountPublicKey: Uint8Array;
  generation: number;
}

export interface PinnedIdentity extends PinnedAccount {
  blocked: boolean;
}

export interface PinLookup {
  pinned(userId: number): Promise<PinnedIdentity | undefined>;
}

export interface RevokedDevice {
  accountId: number;
  deviceId: string;
  generation: number;
}

export interface RevocationLookup {
  isRevoked(device: RevokedDevice): Promise<boolean>;
}

export interface SignedRevocation extends Revocation {
  signature: Uint8Array;
  signerPublicKey: Uint8Array;
  signerCredential: Uint8Array;
  signerServer: string;
  leaveRequestId?: string | null;
}

export function deviceCredentialPayload(fields: CredentialFields): Uint8Array {
  return encodeCanonicalMap({
    server: fields.server,
    accountId: fields.accountId,
    deviceId: fields.deviceId,
    generation: fields.generation,
    devicePublicKey: fields.devicePublicKey,
  });
}

export function revocationPayload(revocation: Revocation): Uint8Array {
  return encodeCanonicalMap({
    deviceId: revocation.deviceId,
    generation: revocation.generation,
    revokedAt: revocation.revokedAt,
    signerDeviceId: revocation.signerDeviceId,
  });
}

export function leaveRequestPayload(request: LeaveRequestFields): Uint8Array {
  return encodeCanonicalMap({
    deviceId: request.deviceId,
    generation: request.generation,
    requestedAt: request.requestedAt,
    leaveRequestId: request.leaveRequestId,
  });
}

function signedPayload(revocation: SignedRevocation): Uint8Array {
  const leaveRequestId = revocation.leaveRequestId ?? null;
  if (leaveRequestId === null) return revocationPayload(revocation);
  if (revocation.signerDeviceId !== revocation.deviceId) return new Uint8Array();
  return leaveRequestPayload({
    deviceId: revocation.deviceId,
    generation: revocation.generation,
    requestedAt: revocation.revokedAt,
    leaveRequestId,
  });
}

export async function verifyEd25519(
  publicKey: Uint8Array,
  signature: Uint8Array,
  data: Uint8Array,
): Promise<boolean> {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      new Uint8Array(signature),
      new Uint8Array(data),
    );
  } catch {
    return false;
  }
}

export async function verifyCredential(
  accountPublic: Uint8Array,
  credential: Credential,
  expected: { server: string; accountId: number },
): Promise<boolean> {
  if (credential.server !== expected.server || credential.accountId !== expected.accountId) {
    return false;
  }
  return verifyEd25519(accountPublic, credential.signature, deviceCredentialPayload(credential));
}

export async function verifyRevocation(
  revocation: SignedRevocation,
  signer: { server: string; accountId: number; pin: PinnedAccount },
): Promise<boolean> {
  const signerCredential: Credential = {
    server: revocation.signerServer,
    accountId: signer.accountId,
    deviceId: revocation.signerDeviceId,
    generation: signer.pin.generation,
    devicePublicKey: revocation.signerPublicKey,
    signature: revocation.signerCredential,
  };
  const chained = await verifyCredential(signer.pin.accountPublicKey, signerCredential, signer);
  return (
    chained &&
    (await verifyEd25519(
      revocation.signerPublicKey,
      revocation.signature,
      signedPayload(revocation),
    ))
  );
}

export function createCredentialValidator(options: {
  server: string;
  pins: PinLookup;
  revocations: RevocationLookup;
}): CredentialValidator {
  return async (credential, context) => {
    if (credential.server !== options.server) return "wrong_server";
    if (!context.expectedUserIds.includes(credential.accountId)) return "not_a_participant";
    const pin = await options.pins.pinned(credential.accountId);
    if (pin === undefined) return "unpinned";
    if (pin.blocked) return "identity_changed";
    if (credential.generation !== pin.generation) return "chain_invalid";
    const chained = await verifyCredential(pin.accountPublicKey, credential, {
      server: options.server,
      accountId: credential.accountId,
    });
    if (!chained) return "chain_invalid";
    return (await options.revocations.isRevoked(credential)) ? "revoked" : "ok";
  };
}
