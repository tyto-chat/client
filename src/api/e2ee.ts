import { ApiError, apiClient } from "@/api/client";
import type { SignedRevocation } from "@/e2ee/credentials";
import type { Credential } from "@/e2ee/engine";

export interface PeerDevice {
  id: string;
  credential: Credential;
  createdAt: string;
}

export interface UserDevices {
  accountPublicKey: Uint8Array | null;
  generation: number | null;
  devices: PeerDevice[];
}

export interface UserRevocation extends SignedRevocation {
  leaveRequestId: string | null;
}

export interface ClaimedKeyPackage {
  deviceId: string;
  keyPackage: Uint8Array;
}

export interface GroupState {
  epoch: number;
  generation: number;
  groupInfo: Uint8Array | null;
  frozenGenerations: number[];
}

export interface GroupCommit {
  commitId: string;
  epoch: number;
  generation: number;
  deviceId: string;
  commit: Uint8Array;
  leaveRequestId: string | null;
  createdAt: number;
}

export interface CommitSubmission {
  commitId: string;
  deviceId: string;
  epoch: number;
  generation: number;
  commit: Uint8Array;
  groupInfo: Uint8Array;
  welcomes: { deviceId: string; data: Uint8Array }[];
  leaveRequestId?: string;
}

export interface CommitResult {
  commitId: string;
  epoch: number;
  generation: number;
}

export interface Welcome {
  id: string;
  deviceId: string;
  conversation: string;
  epoch: number;
  generation: number;
  data: Uint8Array;
  createdAt: number;
}

export class StaleEpochError extends Error {
  readonly currentEpoch: number;

  constructor(currentEpoch: number) {
    super(`the conversation is already at epoch ${currentEpoch}`);
    this.name = "StaleEpochError";
    this.currentEpoch = currentEpoch;
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

interface WireDevice {
  id: string;
  publicKey: string;
  credential: string;
  server: string;
  generation: number;
  createdAt: string;
}

interface WireRevocation {
  deviceId: string;
  generation: number;
  revokedAt: number;
  signerDeviceId: string;
  signature: string;
  signerPublicKey: string;
  signerCredential: string;
  signerServer: string;
  leaveRequestId: string | null;
}

interface WireCommit extends Omit<GroupCommit, "commit"> {
  commit: string;
}

interface WireWelcome extends Omit<Welcome, "data"> {
  data: string;
}

export async function fetchUserDevices(userId: number): Promise<UserDevices> {
  const data = await apiClient.get<{
    accountPublicKey: string | null;
    generation: number | null;
    devices: WireDevice[];
  }>(`/api/e2ee/users/${userId}/devices`);
  return {
    accountPublicKey: data.accountPublicKey === null ? null : fromBase64(data.accountPublicKey),
    generation: data.generation,
    devices: data.devices.map((device) => ({
      id: device.id,
      createdAt: device.createdAt,
      credential: {
        server: device.server,
        accountId: userId,
        deviceId: device.id,
        generation: device.generation,
        devicePublicKey: fromBase64(device.publicKey),
        signature: fromBase64(device.credential),
      },
    })),
  };
}

export async function fetchUserRevocations(userId: number): Promise<UserRevocation[]> {
  const data = await apiClient.get<{ items: WireRevocation[] }>(
    `/api/e2ee/users/${userId}/revocations`,
  );
  return data.items.map((r) => ({
    deviceId: r.deviceId,
    generation: r.generation,
    revokedAt: r.revokedAt,
    signerDeviceId: r.signerDeviceId,
    signature: fromBase64(r.signature),
    signerPublicKey: fromBase64(r.signerPublicKey),
    signerCredential: fromBase64(r.signerCredential),
    signerServer: r.signerServer,
    leaveRequestId: r.leaveRequestId,
  }));
}

export async function claimKeyPackages(userId: number): Promise<ClaimedKeyPackage[]> {
  const data = await apiClient.post<{ items: { deviceId: string; keyPackage: string }[] }>(
    `/api/e2ee/users/${userId}/key-package`,
    {},
  );
  return data.items.map((item) => ({
    deviceId: item.deviceId,
    keyPackage: fromBase64(item.keyPackage),
  }));
}

export async function fetchGroupState(conversation: string): Promise<GroupState> {
  const data = await apiClient.get<{
    epoch: number;
    generation: number;
    groupInfo: string | null;
    frozenGenerations: number[];
  }>(`/api/conversations/${conversation}/mls/state`);
  return {
    epoch: data.epoch,
    generation: data.generation,
    groupInfo: data.groupInfo === null ? null : fromBase64(data.groupInfo),
    frozenGenerations: data.frozenGenerations,
  };
}

export async function fetchCommits(conversation: string, after: number): Promise<GroupCommit[]> {
  const data = await apiClient.get<{ items: WireCommit[] }>(
    `/api/conversations/${conversation}/mls/commits?after=${after}`,
  );
  return data.items.map((item) => ({ ...item, commit: fromBase64(item.commit) }));
}

export async function submitCommit(
  conversation: string,
  submission: CommitSubmission,
): Promise<CommitResult> {
  try {
    const result = await apiClient.post<CommitResult>(
      `/api/conversations/${conversation}/mls/commits`,
      {
        commitId: submission.commitId,
        deviceId: submission.deviceId,
        epoch: submission.epoch,
        generation: submission.generation,
        commit: toBase64(submission.commit),
        groupInfo: toBase64(submission.groupInfo),
        welcomes: submission.welcomes.map((w) => ({
          deviceId: w.deviceId,
          data: toBase64(w.data),
        })),
        ...(submission.leaveRequestId !== undefined && {
          leaveRequestId: submission.leaveRequestId,
        }),
      },
    );
    return { commitId: result.commitId, epoch: result.epoch, generation: result.generation };
  } catch (error) {
    const body =
      error instanceof ApiError ? (error.body as { code?: string; currentEpoch?: number }) : null;
    if (error instanceof ApiError && error.status === 409 && body?.code === "stale_epoch") {
      throw new StaleEpochError(body.currentEpoch ?? 0);
    }
    throw error;
  }
}

export async function fetchWelcomes(deviceId: string, after?: string): Promise<Welcome[]> {
  const cursor = after === undefined ? "" : `&after=${encodeURIComponent(after)}`;
  const data = await apiClient.get<{ items: WireWelcome[] }>(
    `/api/e2ee/welcomes?deviceId=${encodeURIComponent(deviceId)}${cursor}`,
  );
  return data.items.map((item) => ({ ...item, data: fromBase64(item.data) }));
}

export function acknowledgeWelcome(welcomeId: string): Promise<void> {
  return apiClient.post<void>(`/api/e2ee/welcomes/${welcomeId}/ack`, {});
}
