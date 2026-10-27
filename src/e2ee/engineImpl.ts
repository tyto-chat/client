import type { MlsEngine } from "./engine";
import { getPlatformBridge } from "@/platform/bridge";
import {
  BridgeVersionError,
  MLS_BRIDGE_VERSION,
  type BridgeE2eeScope,
  type BridgeMls,
  type PlatformBridge,
} from "@/platform/PlatformBridge";

export function requireMlsBridge(bridge: PlatformBridge): BridgeMls {
  const version = bridge.bridgeVersion ?? 0;
  if (bridge.mls === undefined || version < MLS_BRIDGE_VERSION) {
    throw new BridgeVersionError(version, MLS_BRIDGE_VERSION);
  }
  return bridge.mls;
}

export function createMlsEngine(
  scope: BridgeE2eeScope,
  bridge: PlatformBridge = getPlatformBridge(),
): MlsEngine {
  const mls = requireMlsBridge(bridge);
  return {
    createDeviceKey: () => mls.createDeviceKey(scope),
    generateDevice: (credential) => mls.generateDevice(scope, credential),
    latestState: () => mls.latestState(scope),
    pendingStages: () => mls.pendingStages(scope),
    createKeyPackages: (state, count, lifetimeSeconds) =>
      mls.createKeyPackages(scope, state, count, lifetimeSeconds),
    inspectKeyPackage: (keyPackage) => mls.inspectKeyPackage(keyPackage),
    inspectGroupInfo: (groupInfo) => mls.inspectGroupInfo(groupInfo),
    createGroup: (state, groupId) => mls.createGroup(scope, state, groupId),
    addMembers: (state, groupId, keyPackages) => mls.addMembers(scope, state, groupId, keyPackages),
    joinFromWelcome: (state, welcome) => mls.joinFromWelcome(scope, state, welcome),
    joinExternal: (state, groupInfo) => mls.joinExternal(scope, state, groupInfo),
    removeMember: (state, groupId, leafIndex) => mls.removeMember(scope, state, groupId, leafIndex),
    stageIncomingCommit: (state, groupId, commit) =>
      mls.stageIncomingCommit(scope, state, groupId, commit),
    merge: (staged) => mls.merge(staged.id),
    discard: (staged) => mls.discard(staged.id),
    encrypt: (state, groupId, data) => mls.encrypt(scope, state, groupId, data),
    decrypt: (state, groupId, message) => mls.decrypt(scope, state, groupId, message),
    signKeyPackageUpload: (upload) => mls.signKeyPackageUpload(scope, upload),
    signRevocation: (revocation) => mls.signRevocation(scope, revocation),
  };
}
