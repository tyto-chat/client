import {
  createConversation,
  createConversationMessage,
  fetchConversation,
  fetchConversations,
} from "@/api/conversations";
import {
  acknowledgeWelcome,
  claimKeyPackages,
  fetchCommits,
  fetchGroupState,
  fetchUserDevices,
  fetchUserRevocations,
  fetchLeaveRequests,
  fetchOwnDevices,
  fetchWelcomes,
  revokeDevice,
  sendLeaveRequest,
  submitCommit,
  type ClaimedKeyPackage,
  type DeviceRevocationInput,
  type LeaveRequest,
  type LeaveRequestInput,
  type OwnDevice,
  type CommitResult,
  type CommitSubmission,
  type GroupCommit,
  type GroupState,
  type UserDevices,
  type UserRevocation,
  type Welcome,
} from "@/api/e2ee";
import { editMessage, fetchMessage } from "@/api/messages";
import { createThreadReply } from "@/api/threads";
import type { Conversation, Message } from "@/types/api";

export interface E2eeTransport {
  createEncryptedConversation(memberUserIds: number[]): Promise<Conversation>;
  fetchConversation(identifier: string): Promise<Conversation>;
  fetchUserDevices(userId: number): Promise<UserDevices>;
  fetchUserRevocations(userId: number): Promise<UserRevocation[]>;
  claimKeyPackages(userId: number): Promise<ClaimedKeyPackage[]>;
  fetchGroupState(conversation: string): Promise<GroupState>;
  fetchCommits(conversation: string, after: number): Promise<GroupCommit[]>;
  submitCommit(conversation: string, submission: CommitSubmission): Promise<CommitResult>;
  fetchWelcomes(deviceId: string, after?: string): Promise<Welcome[]>;
  acknowledgeWelcome(welcomeId: string): Promise<void>;
  sendMessage(
    conversation: string,
    text: string,
    id: string,
    attachmentIris?: string[],
  ): Promise<Message>;
  sendReply(
    rootUuid: string,
    text: string,
    id: string,
    attachmentIris?: string[],
  ): Promise<Message>;
  editMessage(messageIri: string, text: string, baseRevisionCount: number): Promise<Message>;
  fetchMessage(uuid: string): Promise<Message>;
  fetchEncryptedConversations(): Promise<Conversation[]>;
  fetchOwnDevices(): Promise<OwnDevice[]>;
  revokeDevice(deviceId: string, revocation: DeviceRevocationInput): Promise<void>;
  sendLeaveRequest(deviceId: string, request: LeaveRequestInput): Promise<void>;
  fetchLeaveRequests(conversation: string): Promise<LeaveRequest[]>;
}

export const httpE2eeTransport: E2eeTransport = {
  createEncryptedConversation: (memberUserIds) =>
    createConversation(memberUserIds, { encrypted: true }),
  fetchConversation,
  fetchUserDevices,
  fetchUserRevocations,
  claimKeyPackages,
  fetchGroupState,
  fetchCommits,
  submitCommit,
  fetchWelcomes,
  acknowledgeWelcome,
  sendMessage: (conversation, text, id, attachmentIris = []) =>
    createConversationMessage(conversation, text, attachmentIris, id),
  sendReply: (rootUuid, text, id, attachmentIris = []) =>
    createThreadReply(rootUuid, text, attachmentIris, id),
  editMessage,
  fetchMessage,
  fetchEncryptedConversations: async () =>
    (await fetchConversations()).filter((c) => c.encrypted === true),
  fetchOwnDevices,
  revokeDevice,
  sendLeaveRequest,
  fetchLeaveRequests,
};
