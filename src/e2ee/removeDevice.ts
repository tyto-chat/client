import type { E2eeIdentity } from "./conversationSession";

export class DeviceNotFoundError extends Error {
  constructor() {
    super("that device is not one of this account's active devices");
    this.name = "DeviceNotFoundError";
  }
}

export class RemovalIncompleteError extends Error {
  readonly conversations: string[];

  constructor(conversations: string[]) {
    super("the device was removed, but some conversations still list it until they sync");
    this.name = "RemovalIncompleteError";
    this.conversations = conversations;
  }
}

export async function removeDevice(identity: E2eeIdentity, deviceId: string): Promise<void> {
  if (deviceId === identity.deviceId) throw new Error("use leaveDevice to remove this device");
  const { transport, engine, pins, revocations } = identity;
  const own = await transport.fetchUserDevices(identity.userId);
  const target = own.devices.find((d) => d.id === deviceId);
  if (target === undefined) throw new DeviceNotFoundError();

  const revocation = {
    deviceId,
    generation: target.credential.generation,
    revokedAt: Math.floor(Date.now() / 1000),
    signerDeviceId: identity.deviceId,
  };
  const signature = await engine.signRevocation(revocation);
  if (!(await pins.has(identity.userId))) {
    await pins.pin(identity.userId, identity.accountPublicKey, identity.credential.generation);
  }
  await revocations.merge(identity.userId, [
    {
      ...revocation,
      signature,
      signerPublicKey: identity.credential.devicePublicKey,
      signerCredential: identity.credential.signature,
      signerServer: identity.credential.server,
      leaveRequestId: null,
    },
  ]);

  const pending: string[] = [];
  const conversations = await transport.fetchEncryptedConversations().catch(() => {
    pending.push("*");
    return [];
  });
  for (const conversation of conversations) {
    try {
      await identity.session(conversation).removeRevoked();
    } catch {
      pending.push(conversation.identifier);
    }
  }
  await transport.revokeDevice(deviceId, {
    signerDeviceId: identity.deviceId,
    revokedAt: revocation.revokedAt,
    signature,
  });
  if (pending.length > 0) throw new RemovalIncompleteError(pending);
}
