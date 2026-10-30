import { fromBase64, toBase64 } from "@/api/e2ee";
import type { E2eeIdentity } from "./conversationSession";
import type { KeyStore, KeyStoreScope } from "./keyStore";
import type { E2eeTransport } from "./transport";

const MARKER = "leaving";

interface LeavingMarker {
  deviceId: string;
  leaveRequestId: string;
  requestedAt: number;
  signature: string;
}

function markerScope(scope: KeyStoreScope): KeyStoreScope {
  return { ...scope, profileId: `${scope.profileId}:leaving` };
}

export async function leaveDevice(identity: E2eeIdentity): Promise<void> {
  const request = {
    deviceId: identity.deviceId,
    generation: identity.credential.generation,
    requestedAt: Math.floor(Date.now() / 1000),
    leaveRequestId: crypto.randomUUID(),
  };
  const signature = await identity.engine.signLeaveRequest(request);
  const marker: LeavingMarker = {
    deviceId: request.deviceId,
    leaveRequestId: request.leaveRequestId,
    requestedAt: request.requestedAt,
    signature: toBase64(signature),
  };
  await identity.keyStore.putRecords(markerScope(identity.scope), "security", [
    { id: MARKER, data: new TextEncoder().encode(JSON.stringify(marker)) },
  ]);
  await identity.keyStore.deleteScope(identity.scope);
  await identity.engine.deleteDeviceKey();
  await resumeLeave(identity.keyStore, identity.scope, identity.transport).catch(() => false);
}

export async function resumeLeave(
  keyStore: KeyStore,
  scope: KeyStoreScope,
  transport: Pick<E2eeTransport, "sendLeaveRequest">,
): Promise<boolean> {
  const data = await keyStore.getRecord(markerScope(scope), "security", MARKER);
  if (data === null) return false;
  const marker = JSON.parse(new TextDecoder().decode(data)) as LeavingMarker;
  await transport.sendLeaveRequest(marker.deviceId, {
    leaveRequestId: marker.leaveRequestId,
    requestedAt: marker.requestedAt,
    signature: fromBase64(marker.signature),
  });
  await keyStore.deleteScope(markerScope(scope));
  return true;
}
