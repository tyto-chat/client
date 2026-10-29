import { E2eeIdentity, type SessionLocks } from "@/e2ee/conversationSession";
import type { MlsEngine } from "@/e2ee/engine";
import type { KeyStore } from "@/e2ee/keyStore";
import { PinStore } from "@/e2ee/pinStore";
import { RevocationStore } from "@/e2ee/revocationStore";
import type { E2eeTransport } from "@/e2ee/transport";
import { SERVER, type FakeDeliveryServer, type FakeDevice } from "./fakeDeliveryServer";
import { memoryKeyStoreFactory } from "./memoryKeyStore";
import { MemorySessionLocks } from "./memorySessionLocks";

export function identityFor(
  server: FakeDeliveryServer,
  userId: number,
  device: FakeDevice,
  options: {
    keyStore?: KeyStore;
    engine?: MlsEngine;
    transport?: E2eeTransport;
    locks?: SessionLocks;
  } = {},
): E2eeIdentity {
  const keyStore = options.keyStore ?? memoryKeyStoreFactory()();
  const scope = {
    serverOrigin: SERVER,
    serverUserId: userId,
    profileId: device.credential.deviceId,
  };
  const pins = new PinStore(keyStore, scope);
  const user = server.users.get(userId);
  if (user === undefined) throw new Error(`unknown user ${userId}`);
  return new E2eeIdentity({
    scope,
    server: SERVER,
    userId,
    accountPublicKey: user.account.publicKey,
    credential: device.credential,
    engine: options.engine ?? device.engine,
    keyStore,
    pins,
    revocations: new RevocationStore(keyStore, scope, { server: SERVER, pins }),
    transport: options.transport ?? server.transportFor(userId),
    locks: options.locks ?? new MemorySessionLocks(),
  });
}
