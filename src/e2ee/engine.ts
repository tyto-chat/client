import type {
  BridgeKeyPackageUpload,
  BridgeMlsCredential,
  BridgeMlsMember,
  BridgeMlsStaged,
  BridgeLeaveRequest,
  BridgeRevocation,
} from "@/platform/PlatformBridge";

export type Credential = BridgeMlsCredential;
export type Member = BridgeMlsMember;
export type Staged = BridgeMlsStaged;
export type KeyPackageUpload = BridgeKeyPackageUpload;
export type Revocation = BridgeRevocation;
export type LeaveRequestFields = BridgeLeaveRequest;

export type CredentialCheck =
  | "ok"
  | "unpinned"
  | "identity_changed"
  | "chain_invalid"
  | "revoked"
  | "wrong_server"
  | "not_a_participant";

export type CredentialValidator = (
  credential: Credential,
  context: { conversationId: number; expectedUserIds: number[] },
) => Promise<CredentialCheck>;

export interface MlsEngine {
  createDeviceKey(): Promise<{ devicePublicKey: Uint8Array }>;
  generateDevice(credential: Credential): Promise<{ state: Uint8Array }>;
  latestState(): Promise<{ state: Uint8Array } | null>;
  pendingStages(): Promise<{ id: string; groupId: string }[]>;
  createKeyPackages(
    state: Uint8Array,
    count: number,
    lifetimeSeconds: number,
  ): Promise<{ packages: Uint8Array[]; lastResort: Uint8Array; state: Uint8Array }>;
  inspectKeyPackage(keyPackage: Uint8Array): Promise<Credential>;
  inspectGroupInfo(
    groupInfo: Uint8Array,
  ): Promise<{ groupId: string; epoch: number; members: Member[] }>;
  createGroup(state: Uint8Array, groupId: string): Promise<Staged>;
  addMembers(state: Uint8Array, groupId: string, keyPackages: Uint8Array[]): Promise<Staged>;
  joinFromWelcome(state: Uint8Array, welcome: Uint8Array): Promise<Staged>;
  joinExternal(state: Uint8Array, groupInfo: Uint8Array): Promise<Staged>;
  removeMember(state: Uint8Array, groupId: string, leafIndex: number): Promise<Staged>;
  stageIncomingCommit(state: Uint8Array, groupId: string, commit: Uint8Array): Promise<Staged>;
  merge(staged: Pick<Staged, "id">): Promise<{ state: Uint8Array }>;
  discard(staged: Pick<Staged, "id">): Promise<void>;
  encrypt(
    state: Uint8Array,
    groupId: string,
    data: Uint8Array,
  ): Promise<{ state: Uint8Array; message: Uint8Array }>;
  decrypt(
    state: Uint8Array,
    groupId: string,
    message: Uint8Array,
  ): Promise<{ state: Uint8Array; data: Uint8Array; sender: Credential; receipt: string }>;
  acknowledgeDecrypt(receipt: string): Promise<void>;
  signKeyPackageUpload(upload: KeyPackageUpload): Promise<Uint8Array>;
  signRevocation(revocation: Revocation): Promise<Uint8Array>;
  signLeaveRequest(request: LeaveRequestFields): Promise<Uint8Array>;
  deleteDeviceKey(): Promise<void>;
}
