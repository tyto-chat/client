import {
  StaleEpochError,
  type ClaimedKeyPackage,
  type CommitSubmission,
  type GroupCommit,
  type LeaveRequest,
  type UserRevocation,
} from "@/api/e2ee";
import { ApiError } from "@/api/client";
import type { E2eeTransport } from "@/e2ee/transport";
import type { Attachment, Conversation, Message } from "@/types/api";
import { createFakeMlsEngine } from "./fakeMlsEngine";
import { SERVER, ed25519Key, signedDevice, type TestKey } from "./e2eeKeys";
import type { Credential, MlsEngine } from "@/e2ee/engine";

export interface FakeDevice {
  credential: Credential;
  key: TestKey;
  engine: MlsEngine & { latest: () => Uint8Array; keyDeleted: () => boolean };
  packages: Uint8Array[];
}

interface FakeUser {
  account: TestKey;
  generation: number;
  devices: FakeDevice[];
  revocations: UserRevocation[];
}

interface FakeWelcome {
  id: string;
  deviceId: string;
  conversation: string;
  epoch: number;
  generation: number;
  data: Uint8Array;
  delivered: boolean;
}

interface FakeConversation {
  conversation: Conversation;
  commits: GroupCommit[];
  generation: number;
  frozen: number[];
}

export class NetworkDrop extends TypeError {
  constructor() {
    super("Failed to fetch");
  }
}

let conversationIds = 100;

export class FakeDeliveryServer {
  readonly users = new Map<number, FakeUser>();
  readonly conversations = new Map<string, FakeConversation>();
  readonly messages = new Map<string, Message>();
  readonly attachments = new Map<string, { attachment: Attachment; blob: Blob }>();

  storeAttachment(blob: Blob): Attachment {
    const n = this.attachments.size + 1;
    const attachment = {
      "@id": `/api/v1/attachments/${n}`,
      "@type": "MediaObject",
      type: "encrypted_attachment",
      size: blob.size,
      contentUrl: `${SERVER}/media/token/${n}.bin`,
    } as unknown as Attachment;
    this.attachments.set(attachment["@id"], { attachment, blob });
    return attachment;
  }

  attachmentBlob(contentUrl: string): Blob {
    for (const { attachment, blob } of this.attachments.values()) {
      if (attachment.contentUrl === contentUrl) return blob;
    }
    throw new Error("no such attachment");
  }
  readonly welcomes: FakeWelcome[] = [];
  readonly leaveRequests: {
    conversation: string;
    request: LeaveRequest;
    fulfilled: boolean;
  }[] = [];
  readonly calls: { userId: number; method: string; args: unknown[] }[] = [];
  private readonly drops = new Map<string, number>();
  private clock = Date.parse("2026-10-29T10:00:00Z");

  async addUser(userId: number): Promise<FakeUser> {
    const user: FakeUser = {
      account: await ed25519Key(),
      generation: 1,
      devices: [],
      revocations: [],
    };
    this.users.set(userId, user);
    return user;
  }

  async addDevice(
    userId: number,
    options: { account?: TestKey; generation?: number; packages?: number } = {},
  ): Promise<FakeDevice> {
    const user = this.users.get(userId) ?? (await this.addUser(userId));
    const { credential, device } = await signedDevice(options.account ?? user.account, {
      accountId: userId,
      generation: options.generation ?? user.generation,
    });
    const engine = createFakeMlsEngine(credential, device);
    const generated = await engine.generateDevice(credential);
    const { packages } = await engine.createKeyPackages(
      generated.state,
      options.packages ?? 5,
      86_400,
    );
    const fake: FakeDevice = {
      credential,
      key: device,
      engine,
      packages: packages.map((p, i) => {
        const tagged = JSON.parse(new TextDecoder().decode(p)) as Record<string, unknown>;
        return new TextEncoder().encode(
          JSON.stringify({ ...tagged, n: `${credential.deviceId}-${i}` }),
        );
      }),
    };
    user.devices.push(fake);
    return fake;
  }

  dropResponse(method: keyof E2eeTransport, times = 1): void {
    this.drops.set(method, times);
  }

  conversationOf(identifier: string): FakeConversation {
    const found = this.conversations.get(identifier);
    if (found === undefined) throw new Error(`no conversation ${identifier}`);
    return found;
  }

  message(id: string): Message {
    const found = this.messages.get(id);
    if (found === undefined) throw new Error(`no message ${id}`);
    return structuredClone(found);
  }

  putMessage(message: Message): void {
    this.messages.set(message.id, structuredClone(message));
  }

  submitRaw(userId: number, conversation: string, submission: CommitSubmission) {
    return this.transportFor(userId).submitCommit(conversation, submission);
  }

  transportFor(userId: number): E2eeTransport {
    const call = async <T>(
      method: keyof E2eeTransport,
      args: unknown[],
      run: () => T,
    ): Promise<T> => {
      this.calls.push({ userId, method, args });
      const result = run();
      const drops = this.drops.get(method) ?? 0;
      if (drops > 0) {
        this.drops.set(method, drops - 1);
        throw new NetworkDrop();
      }
      return structuredClone(result);
    };
    return {
      createEncryptedConversation: (memberUserIds) =>
        call("createEncryptedConversation", [memberUserIds], () =>
          this.createConversation([userId, ...memberUserIds]),
        ),
      fetchConversation: (identifier) =>
        call("fetchConversation", [identifier], () => this.conversationOf(identifier).conversation),
      fetchUserDevices: (target) =>
        call("fetchUserDevices", [target], () => {
          const user = this.users.get(target);
          return {
            accountPublicKey: user?.account.publicKey ?? null,
            generation: user?.generation ?? null,
            devices: (user?.devices ?? []).map((d) => ({
              id: d.credential.deviceId,
              credential: d.credential,
              createdAt: "2026-10-29T10:00:00+00:00",
            })),
          };
        }),
      fetchUserRevocations: (target) =>
        call("fetchUserRevocations", [target], () => this.users.get(target)?.revocations ?? []),
      claimKeyPackages: (target) =>
        call("claimKeyPackages", [target], () => {
          const claimed: ClaimedKeyPackage[] = [];
          for (const device of this.users.get(target)?.devices ?? []) {
            const keyPackage = device.packages.shift();
            if (keyPackage !== undefined) {
              claimed.push({ deviceId: device.credential.deviceId, keyPackage });
            }
          }
          return claimed;
        }),
      fetchGroupState: (identifier) =>
        call("fetchGroupState", [identifier], () => {
          const conversation = this.conversationOf(identifier);
          const last = conversation.commits.at(-1);
          return {
            epoch: last?.epoch ?? 0,
            generation: conversation.generation,
            groupInfo: null,
            frozenGenerations: [...conversation.frozen],
          };
        }),
      fetchCommits: (identifier, after) =>
        call("fetchCommits", [identifier, after], () =>
          this.conversationOf(identifier)
            .commits.filter((c) => c.epoch > after)
            .slice(0, 100),
        ),
      submitCommit: (identifier, submission) =>
        call("submitCommit", [identifier, submission], () =>
          this.acceptCommit(identifier, submission),
        ),
      fetchWelcomes: (deviceId, after) =>
        call("fetchWelcomes", [deviceId, after], () =>
          this.welcomes
            .slice(after === undefined ? 0 : this.welcomes.findIndex((w) => w.id === after) + 1)
            .filter((w) => w.deviceId === deviceId && !w.delivered)
            .slice(0, 50)
            .map((w) => ({ ...w, createdAt: 0 })),
        ),
      acknowledgeWelcome: (id) =>
        call("acknowledgeWelcome", [id], () => {
          const welcome = this.welcomes.find((w) => w.id === id);
          if (welcome !== undefined) welcome.delivered = true;
        }),
      sendMessage: (identifier, text, id, attachmentIris = []) =>
        call("sendMessage", [identifier, text, id, attachmentIris], () =>
          this.storeMessage(userId, identifier, text, id, null, attachmentIris),
        ),
      sendReply: (rootUuid, text, id, attachmentIris = []) =>
        call("sendReply", [rootUuid, text, id, attachmentIris], () => {
          const root = this.message(rootUuid);
          return this.storeMessage(
            userId,
            root.conversationIdentifier as string,
            text,
            id,
            root,
            attachmentIris,
          );
        }),
      editMessage: (iri, text, baseRevisionCount) =>
        call("editMessage", [iri, text, baseRevisionCount], () => {
          const message = this.messages.get(iri.slice(iri.lastIndexOf("/") + 1));
          if (message === undefined) throw new Error("no such message");
          if (baseRevisionCount !== message.revisionCount) {
            throw new ApiError(409, {
              code: "revision_conflict",
              currentRevisionCount: message.revisionCount,
            });
          }
          message.text = text;
          message.revisionCount = (message.revisionCount ?? 1) + 1;
          message.edited = true;
          message.revisedAt = this.tick();
          return message;
        }),
      fetchMessage: (uuid) => call("fetchMessage", [uuid], () => this.message(uuid)),
      fetchEncryptedConversations: () =>
        call("fetchEncryptedConversations", [], () =>
          [...this.conversations.values()]
            .map((c) => c.conversation)
            .filter((c) => c.members.some((m) => m.userId === userId)),
        ),
      fetchOwnDevices: () =>
        call("fetchOwnDevices", [], () =>
          (this.users.get(userId)?.devices ?? []).map((d) => ({
            id: d.credential.deviceId,
            name: `Device ${d.credential.deviceId.slice(0, 4)}`,
            generation: d.credential.generation,
            createdAt: "2026-10-29T10:00:00+00:00",
            lastSeenAt: "2026-10-30T10:00:00+00:00",
          })),
        ),
      revokeDevice: (deviceId, revocation) =>
        call("revokeDevice", [deviceId, revocation], () => {
          const user = this.users.get(userId);
          const signer = user?.devices.find(
            (d) => d.credential.deviceId === revocation.signerDeviceId,
          );
          const target = user?.devices.find((d) => d.credential.deviceId === deviceId);
          if (user === undefined || signer === undefined || target === undefined) {
            throw new ApiError(404, { error: "Device not found." });
          }
          user.devices = user.devices.filter((d) => d !== target);
          user.revocations.push({
            deviceId,
            generation: target.credential.generation,
            revokedAt: revocation.revokedAt,
            signerDeviceId: revocation.signerDeviceId,
            signature: revocation.signature,
            signerPublicKey: signer.credential.devicePublicKey,
            signerCredential: signer.credential.signature,
            signerServer: signer.credential.server,
            leaveRequestId: null,
          });
        }),
      sendLeaveRequest: (deviceId, request) =>
        call("sendLeaveRequest", [deviceId, request], () => {
          const user = this.users.get(userId);
          const target = user?.devices.find((d) => d.credential.deviceId === deviceId);
          if (user === undefined || target === undefined) {
            throw new ApiError(404, { error: "Device not found." });
          }
          user.devices = user.devices.filter((d) => d !== target);
          user.revocations.push({
            deviceId,
            generation: target.credential.generation,
            revokedAt: request.requestedAt,
            signerDeviceId: deviceId,
            signature: request.signature,
            signerPublicKey: target.credential.devicePublicKey,
            signerCredential: target.credential.signature,
            signerServer: target.credential.server,
            leaveRequestId: request.leaveRequestId,
          });
          for (const { conversation } of this.conversations.values()) {
            if (!conversation.members.some((m) => m.userId === userId)) continue;
            this.leaveRequests.push({
              conversation: conversation.identifier,
              request: {
                leaveRequestId: request.leaveRequestId,
                deviceId,
                userId,
                generation: target.credential.generation,
                requestedAt: request.requestedAt,
              },
              fulfilled: false,
            });
          }
        }),
      fetchLeaveRequests: (conversation) =>
        call("fetchLeaveRequests", [conversation], () =>
          this.leaveRequests
            .filter((l) => l.conversation === conversation && !l.fulfilled)
            .map((l) => l.request),
        ),
    };
  }

  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private createConversation(memberIds: number[]): Conversation {
    const sorted = [...new Set(memberIds)].sort((a, b) => a - b);
    for (const { conversation } of this.conversations.values()) {
      const ids = conversation.members.map((m) => m.userId).sort((a, b) => a - b);
      if (ids.join() === sorted.join()) return conversation;
    }
    const id = (conversationIds += 1);
    const conversation = {
      "@id": `/api/v1/conversations/c${id}`,
      "@type": "Conversation",
      id,
      identifier: `c${id}`,
      encrypted: true,
      members: sorted.map((userId) => ({
        "@id": `/api/v1/conversation_members/${userId}`,
        id: userId,
        userId,
        profile: { "@id": `/api/profiles/${userId}`, name: `User ${userId}`, avatar: null },
        joinedAt: "2026-10-29T10:00:00+00:00",
        mutedUntil: null,
        lastReadAt: null,
      })),
      unreadCount: 0,
      readOnly: false,
      readOnlyReason: null,
      lastMessageAt: null,
    } as unknown as Conversation;
    this.conversations.set(conversation.identifier, {
      conversation,
      commits: [],
      generation: 0,
      frozen: [],
    });
    return conversation;
  }

  private acceptCommit(identifier: string, submission: CommitSubmission) {
    const conversation = this.conversationOf(identifier);
    const known = conversation.commits.find((c) => c.commitId === submission.commitId);
    if (known !== undefined) {
      return { commitId: known.commitId, epoch: known.epoch, generation: known.generation };
    }
    const current = conversation.commits.at(-1)?.epoch ?? 0;
    if (submission.epoch !== current + 1) throw new StaleEpochError(current);
    if (submission.leaveRequestId !== undefined) {
      const pending = this.leaveRequests.find(
        (l) =>
          l.conversation === identifier && l.request.leaveRequestId === submission.leaveRequestId,
      );
      if (pending === undefined) throw new ApiError(404, { error: "leave request not found" });
      if (pending.fulfilled) throw new StaleEpochError(current);
      pending.fulfilled = true;
    }
    if (submission.generation > conversation.generation && conversation.generation > 0) {
      conversation.frozen.push(conversation.generation);
    }
    conversation.generation = Math.max(conversation.generation, submission.generation);
    const createdAt = Math.floor(Date.parse(this.tick()) / 1000);
    conversation.commits.push({
      commitId: submission.commitId,
      epoch: submission.epoch,
      generation: submission.generation,
      deviceId: submission.deviceId,
      commit: submission.commit,
      leaveRequestId: submission.leaveRequestId ?? null,
      createdAt,
    });
    for (const welcome of submission.welcomes) {
      this.welcomes.push({
        id: crypto.randomUUID(),
        deviceId: welcome.deviceId,
        conversation: identifier,
        epoch: submission.epoch,
        generation: submission.generation,
        data: welcome.data,
        delivered: false,
      });
    }
    return {
      commitId: submission.commitId,
      epoch: submission.epoch,
      generation: submission.generation,
    };
  }

  private storeMessage(
    userId: number,
    conversation: string,
    text: string,
    id: string,
    parent: Message | null,
    attachmentIris: string[] = [],
  ): Message {
    const existing = this.messages.get(id);
    if (existing !== undefined) {
      if (existing.conversationIdentifier !== conversation || existing.createdBy?.id !== userId) {
        throw new Error("duplicate_message_id");
      }
      return existing;
    }
    if (!text.startsWith("e2ee:1:")) throw new Error("encrypted conversations need an envelope");
    const at = this.tick();
    const message = {
      "@id": `/api/v1/messages/${id}`,
      "@type": "Message",
      id,
      text,
      isDeleted: false,
      edited: false,
      revisionCount: 1,
      revisedAt: at,
      kind: "standard",
      createdAt: at,
      createdBy: {
        "@id": `/api/v1/users/${userId}`,
        id: userId,
        profile: { "@id": `/api/profiles/${userId}`, name: `User ${userId}`, avatar: null },
      },
      reactions: null,
      pageNumber: 1,
      conversationIdentifier: conversation,
      parent,
      attachments: attachmentIris.map((iri) => {
        const stored = this.attachments.get(iri);
        if (stored === undefined) throw new Error("unknown attachment");
        return stored.attachment;
      }),
    } as unknown as Message;
    this.messages.set(id, message);
    return message;
  }
}

export { SERVER };
