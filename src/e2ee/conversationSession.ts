import {
  StaleEpochError,
  fromBase64,
  toBase64,
  type CommitSubmission,
  type Welcome,
} from "@/api/e2ee";
import { ApiError, isNetworkError } from "@/api/client";
import type { Conversation, Message } from "@/types/api";
import {
  createCredentialValidator,
  verifyRevocation,
  type PinLookup,
  type PinnedAccount,
  type PinnedIdentity,
  type RevocationLookup,
  type RevokedDevice,
} from "./credentials";
import type { Credential, CredentialCheck, MlsEngine, Staged } from "./engine";
import {
  accountKeyFingerprint,
  assertPlaintextLength,
  decodeEnvelope,
  decodeKeyMessage,
  encodeEnvelope,
  encodeKeyMessage,
  openContent,
  sameHeader,
  sealContent,
  type Envelope,
  type MessageHeader,
} from "./envelope";
import {
  decodeProgress,
  emptyProgress,
  encodeProgress,
  type GroupProgress,
  type PendingStage,
  type RosterEntry,
} from "./groupProgress";
import type {
  KeyStore,
  KeyStoreScope,
  MessageKeyRef,
  MessageKeySender,
  StoredMessageKey,
} from "./keyStore";
import type { PinStore } from "./pinStore";
import type { RevocationStore } from "./revocationStore";
import { httpE2eeTransport, type E2eeTransport } from "./transport";

export type TamperReason =
  | "malformed"
  | "header_mismatch"
  | "replayed"
  | "other_conversation"
  | "reparented"
  | "revision"
  | "generation"
  | "author"
  | "sender_not_authorised"
  | "frozen_generation";

export type DecryptResult = { text: string } | { unreadable: true } | { tampered: TamperReason };

export type SessionStatus = "ready" | "uninitialised" | "awaiting_welcome" | "removed";

export class PeerIdentityChangedError extends Error {
  readonly userIds: number[];

  constructor(userIds: number[]) {
    super("a participant's encryption identity changed");
    this.name = "PeerIdentityChangedError";
    this.userIds = userIds;
  }
}

export class FrozenGenerationError extends Error {
  constructor() {
    super("this conversation moved to a new encryption generation");
    this.name = "FrozenGenerationError";
  }
}

export class CommitRejectedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`a group change was refused: ${reason}`);
    this.name = "CommitRejectedError";
    this.reason = reason;
  }
}

export class CommitConflictError extends Error {
  constructor() {
    super("the group changed while committing; try again");
    this.name = "CommitConflictError";
  }
}

export class ConversationNotReadyError extends Error {
  readonly status: SessionStatus;

  constructor(status: SessionStatus) {
    super(`the encrypted conversation is not ready (${status})`);
    this.name = "ConversationNotReadyError";
    this.status = status;
  }
}

export class ParticipantNotReachableError extends Error {
  readonly userIds: number[];

  constructor(userIds: number[]) {
    super("a participant has no usable device");
    this.name = "ParticipantNotReachableError";
    this.userIds = userIds;
  }
}

class NothingToCommit extends Error {}

class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

function revokedKey(device: RevokedDevice): string {
  return JSON.stringify([device.accountId, device.deviceId, device.generation]);
}

class TrustOverlay implements PinLookup, RevocationLookup {
  readonly tentative = new Map<number, PinnedAccount>();
  readonly tentativeRevoked = new Set<string>();
  private readonly pins: PinStore;
  private readonly revocations: RevocationStore;

  constructor(pins: PinStore, revocations: RevocationStore) {
    this.pins = pins;
    this.revocations = revocations;
  }

  async isRevoked(device: RevokedDevice): Promise<boolean> {
    return this.tentativeRevoked.has(revokedKey(device)) || this.revocations.isRevoked(device);
  }

  async pinned(userId: number): Promise<PinnedIdentity | undefined> {
    const pin = await this.pins.pinned(userId);
    if (pin !== undefined) return pin;
    const tentative = this.tentative.get(userId);
    return tentative && { ...tentative, blocked: false };
  }
}

const MAX_COMMIT_PAGE = 100;
const TRUST_REFRESH_MS = 60_000;
const EPOCH_CHECK_MS = 1_000;
const MAX_WELCOME_PAGE = 50;
const MAX_WELCOME_PAGES = 20;

function isStaleState(error: unknown): boolean {
  return error instanceof Error && error.message.includes("stale device state");
}

function isGone(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 403);
}

function isRevisionConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.body as { code?: string } | null)?.code === "revision_conflict"
  );
}

async function sha256Base64(text: string): Promise<string> {
  return toBase64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
  );
}

function rosterOf(staged: Staged): RosterEntry[] {
  return staged.resultingRoster.map((member) => ({
    leafIndex: member.leafIndex,
    accountId: member.credential.accountId,
    deviceId: member.credential.deviceId,
    generation: member.credential.generation,
  }));
}

function uuidOf(iri: string): string {
  return iri.slice(iri.lastIndexOf("/") + 1);
}

function secondsOf(timestamp: string | null | undefined): number | null {
  if (timestamp === null || timestamp === undefined) return null;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : ms / 1000;
}

export interface SessionLocks {
  request<T>(name: string, mode: "shared" | "exclusive", task: () => Promise<T>): Promise<T>;
}

function browserSessionLocks(): SessionLocks {
  return {
    request<T>(name: string, mode: "shared" | "exclusive", task: () => Promise<T>): Promise<T> {
      if (typeof navigator === "undefined" || navigator.locks === undefined) {
        return Promise.reject(new Error("encrypted conversations need Web Locks"));
      }
      return navigator.locks.request(name, { mode }, task) as Promise<T>;
    },
  };
}

export interface E2eeIdentityOptions {
  scope: KeyStoreScope;
  server: string;
  userId: number;
  accountPublicKey: Uint8Array;
  credential: Credential;
  engine: MlsEngine;
  keyStore: KeyStore;
  pins: PinStore;
  revocations: RevocationStore;
  transport?: E2eeTransport;
  networkRetries?: number;
  locks?: SessionLocks;
}

export class E2eeIdentity {
  readonly scope: KeyStoreScope;
  readonly server: string;
  readonly userId: number;
  readonly accountPublicKey: Uint8Array;
  readonly credential: Credential;
  readonly engine: MlsEngine;
  readonly keyStore: KeyStore;
  readonly pins: PinStore;
  readonly revocations: RevocationStore;
  readonly transport: E2eeTransport;
  readonly networkRetries: number;
  private readonly locks: SessionLocks;

  private state: Uint8Array | null = null;
  private readonly stateQueue = new SerialQueue();
  private readonly groupQueues = new Map<string, SerialQueue>();
  private readonly sessions = new Map<string, ConversationSession>();
  private ownSender: Promise<MessageKeySender> | null = null;
  private readonly listeners = new Set<() => void>();
  private recovered: Promise<void> | null = null;

  constructor(options: E2eeIdentityOptions) {
    this.scope = options.scope;
    this.server = options.server;
    this.userId = options.userId;
    this.accountPublicKey = options.accountPublicKey;
    this.credential = options.credential;
    this.engine = options.engine;
    this.keyStore = options.keyStore;
    this.pins = options.pins;
    this.revocations = options.revocations;
    this.transport = options.transport ?? httpE2eeTransport;
    this.networkRetries = options.networkRetries ?? 2;
    this.locks = options.locks ?? browserSessionLocks();
  }

  get deviceId(): string {
    return this.credential.deviceId;
  }

  session(conversation: Conversation): ConversationSession {
    let session = this.sessions.get(conversation.identifier);
    if (session === undefined) {
      session = new ConversationSession(this, conversation);
      this.sessions.set(conversation.identifier, session);
    }
    return session;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyChange(): void {
    for (const listener of this.listeners) listener();
  }

  sender(): Promise<MessageKeySender> {
    this.ownSender ??= accountKeyFingerprint(this.accountPublicKey).then((fingerprint) => ({
      userId: this.userId,
      accountKeyFingerprint: fingerprint,
      deviceId: this.credential.deviceId,
    }));
    return this.ownSender;
  }

  ensureRecovered(): Promise<void> {
    this.recovered ??= this.locks
      .request(this.scopeLockName(), "exclusive", () => this.recover())
      .catch(() => undefined);
    return this.recovered;
  }

  private scopeLockName(): string {
    return `tyto-e2ee-session:${JSON.stringify([this.scope.serverOrigin, this.scope.serverUserId, this.scope.profileId])}`;
  }

  async recover(): Promise<void> {
    const referenced = new Set(
      (await this.keyStore.loadRecords(this.scope, "groups"))
        .map((record) => decodeProgress(record.data).pending?.stageId)
        .filter((id): id is string => id !== undefined),
    );
    for (const stage of await this.engine.pendingStages()) {
      if (!referenced.has(stage.id)) await this.engine.discard(stage);
    }
  }

  async processWelcomes(): Promise<string[]> {
    const joined: string[] = [];
    for await (const welcome of this.undeliveredWelcomes()) {
      let conversation: Conversation;
      try {
        conversation = await this.transport.fetchConversation(welcome.conversation);
      } catch (error) {
        if (isGone(error)) await this.transport.acknowledgeWelcome(welcome.id);
        continue;
      }
      try {
        if (await this.session(conversation).acceptWelcome(welcome)) {
          joined.push(conversation.identifier);
        }
      } catch (error) {
        if (!(error instanceof CommitRejectedError)) throw error;
      }
    }
    return joined;
  }

  async *undeliveredWelcomes(): AsyncGenerator<Welcome> {
    let after: string | undefined;
    for (let page = 0; page < MAX_WELCOME_PAGES; page++) {
      const welcomes = await this.transport.fetchWelcomes(this.deviceId, after);
      yield* welcomes;
      const last = welcomes.at(-1);
      if (welcomes.length < MAX_WELCOME_PAGE || last === undefined) return;
      after = last.id;
    }
  }

  async syncAll(): Promise<void> {
    await this.processWelcomes();
    for (const session of this.sessions.values()) await session.sync();
  }

  async handleEvent(event: { type?: string; conversationIdentifier?: string }): Promise<void> {
    if (event.type === "mls.welcome") {
      await this.processWelcomes();
      return;
    }
    if (
      (event.type === "mls.commit" || event.type === "mls.leave_request") &&
      event.conversationIdentifier !== undefined
    ) {
      await this.sessions.get(event.conversationIdentifier)?.sync();
    }
  }

  startSync(intervalMs = 60_000): () => void {
    const run = () => void this.syncAll().catch(() => undefined);
    void this.ensureRecovered().then(run);
    const timer = setInterval(run, intervalMs);
    const online = () => run();
    window.addEventListener("online", online);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
    };
  }

  inGroup<T>(conversation: string, task: () => Promise<T>): Promise<T> {
    let queue = this.groupQueues.get(conversation);
    if (queue === undefined) {
      queue = new SerialQueue();
      this.groupQueues.set(conversation, queue);
    }
    return queue.run(async () => {
      await this.ensureRecovered();
      return this.locks.request(this.scopeLockName(), "shared", () =>
        this.locks.request(`${this.scopeLockName()}:${conversation}`, "exclusive", task),
      );
    });
  }

  withState<T>(
    call: (state: Uint8Array) => Promise<T>,
    next?: (result: T) => Uint8Array,
  ): Promise<T> {
    return this.stateQueue.run(async () => {
      const attempt = async () => {
        const result = await call(await this.currentState());
        if (next !== undefined) this.state = next(result);
        return result;
      };
      try {
        return await attempt();
      } catch (error) {
        if (!isStaleState(error)) throw error;
        this.state = null;
        return attempt();
      }
    });
  }

  merge(stage: Pick<Staged, "id">): Promise<void> {
    return this.stateQueue.run(async () => {
      this.state = (await this.engine.merge(stage)).state;
    });
  }

  async withNetworkRetry<T>(
    call: () => Promise<T>,
    beforeRetry?: () => Promise<T | null>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call();
      } catch (error) {
        if (!isNetworkError(error) || attempt >= this.networkRetries) throw error;
        const settled = beforeRetry === undefined ? null : await beforeRetry().catch(() => null);
        if (settled !== null) return settled;
      }
    }
  }

  private async currentState(): Promise<Uint8Array> {
    if (this.state === null) {
      const latest = await this.engine.latestState();
      if (latest === null) throw new Error("this device has no encryption state");
      this.state = latest.state;
    }
    return this.state;
  }
}

export class ConversationSession {
  readonly identity: E2eeIdentity;
  readonly conversation: Conversation;
  private serverFrozen: number[] = [];
  private trust: TrustOverlay | null = null;
  private trustAt = 0;
  private epochCheck: { at: number; epoch: Promise<number> } | null = null;

  constructor(identity: E2eeIdentity, conversation: Conversation) {
    this.identity = identity;
    this.conversation = conversation;
  }

  get identifier(): string {
    return this.conversation.identifier;
  }

  get participantIds(): number[] {
    return this.conversation.members.map((member) => member.userId);
  }

  async status(): Promise<SessionStatus> {
    const progress = await this.loadProgress();
    if (progress.removed) return "removed";
    if (progress.groupId !== null) return "ready";
    return (await this.identity.transport.fetchGroupState(this.identifier)).epoch === 0
      ? "uninitialised"
      : "awaiting_welcome";
  }

  open(): Promise<void> {
    return this.identity.inGroup(this.identifier, async () => {
      const epoch = await this.syncLocked();
      const progress = await this.loadProgress();
      if (progress.groupId === null && epoch === 0) await this.initialiseLocked();
    });
  }

  sync(): Promise<void> {
    return this.identity.inGroup(this.identifier, async () => {
      this.trust = null;
      await this.syncLocked();
    });
  }

  rotateKeys(): Promise<void> {
    return this.identity.inGroup(this.identifier, async () => {
      await this.syncLocked();
      const progress = await this.readyProgress();
      const groupId = progress.groupId as string;
      await this.commitLocked(
        () => this.identity.withState((s) => this.identity.engine.addMembers(s, groupId, [])),
        { groupId, generation: progress.generation, create: false },
      );
    });
  }

  acceptWelcome(welcome: Welcome): Promise<boolean> {
    return this.identity.inGroup(this.identifier, async () => {
      const joined = await this.joinWelcomeLocked(welcome);
      if (joined) await this.applyCommitsLocked();
      return joined;
    });
  }

  async send(text: string, parentIri?: string): Promise<Message> {
    assertPlaintextLength(text);
    const parent = parentIri === undefined ? null : uuidOf(parentIri);
    const { envelope, id } = await this.identity.inGroup(this.identifier, async () => {
      await this.syncLocked();
      await this.assertPeersUnblocked();
      const id = crypto.randomUUID();
      const { envelope } = await this.encryptLocked({ id, rev: 0, parent }, text, true);
      return { envelope, id };
    });
    const { transport } = this.identity;
    return this.identity.withNetworkRetry(() =>
      parent === null
        ? transport.sendMessage(this.identifier, envelope, id)
        : transport.sendReply(parent, envelope, id),
    );
  }

  async edit(messageIri: string, text: string): Promise<Message> {
    assertPlaintextLength(text);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.editOnce(messageIri, text);
      } catch (error) {
        if (!isRevisionConflict(error) || attempt >= 1) throw error;
      }
    }
  }

  private async editOnce(messageIri: string, text: string): Promise<Message> {
    const { transport } = this.identity;
    const { envelope, base, saveKey } = await this.identity.inGroup(this.identifier, async () => {
      await this.syncLocked();
      await this.assertPeersUnblocked();
      const current = await transport.fetchMessage(uuidOf(messageIri));
      if (current.createdBy?.id !== this.identity.userId) {
        throw new Error("only the author can edit a message");
      }
      if (current.revisionCount === undefined) throw new Error("the server sent no revision count");
      const sealed = await this.encryptLocked(
        { id: current.id, rev: current.revisionCount, parent: current.parent?.id ?? null },
        text,
        false,
      );
      return { ...sealed, base: current.revisionCount };
    });
    const edited = await this.identity.withNetworkRetry(
      () => transport.editMessage(messageIri, envelope, base),
      async () => {
        const latest = await transport.fetchMessage(uuidOf(messageIri));
        return latest.text === envelope ? latest : null;
      },
    );
    await saveKey();
    return edited;
  }

  async decrypt(message: Message): Promise<DecryptResult> {
    if (message.isDeleted || message.text === null) return { unreadable: true };
    const envelope = decodeEnvelope(message.text);
    const rev = (message.revisionCount ?? 0) - 1;
    if (envelope === null || rev < 0) return { tampered: "malformed" };
    const progress = await this.loadProgress();
    const mark = progress.frozen.find((f) => f.generation === envelope.g);
    const at = secondsOf(message.revisedAt ?? message.createdAt);
    if (mark !== undefined && at !== null && at > mark.at) return { tampered: "frozen_generation" };
    const ref = { id: message.id, rev };
    const stored = await this.identity.keyStore.getMessageKey(this.identity.scope, ref);
    if (stored !== null) return this.openStored(message, envelope, rev, stored);
    return this.identity.inGroup(this.identifier, async () => {
      const again =
        (await this.identity.keyStore.getMessageKey(this.identity.scope, ref)) ??
        (await this.promotePendingKey(message, rev));
      if (again !== null) return this.openStored(message, envelope, rev, again);
      return this.decryptLocked(message, envelope, rev);
    });
  }

  private async encryptLocked(
    fields: Pick<MessageHeader, "id" | "rev" | "parent">,
    text: string,
    persist: boolean,
  ): Promise<{ envelope: string; saveKey: () => Promise<void> }> {
    await this.removeRevokedLocked();
    const progress = await this.readyProgress();
    if (
      this.serverFrozen.includes(progress.generation) ||
      progress.frozen.some((f) => f.generation === progress.generation)
    ) {
      throw new FrozenGenerationError();
    }
    const groupId = progress.groupId as string;
    const header: MessageHeader = {
      ...fields,
      conv: this.conversation.id,
      g: progress.generation,
      sender: await this.identity.sender(),
    };
    const sealed = await sealContent(header, text);
    const { message } = await this.identity.withState(
      (s) => this.identity.engine.encrypt(s, groupId, encodeKeyMessage(sealed.key, header)),
      (r) => r.state,
    );
    const envelope = encodeEnvelope({
      g: header.g,
      n: sealed.nonce,
      c: sealed.ciphertext,
      m: message,
    });
    const saveKey = () =>
      this.saveMessageKey(
        { id: header.id, rev: header.rev },
        { key: sealed.key, sender: header.sender },
      );
    if (persist) {
      await saveKey();
    } else {
      await this.identity.keyStore.putRecords(this.identity.scope, "pendingKeys", [
        {
          id: JSON.stringify([header.id, header.rev, await sha256Base64(envelope)]),
          data: new TextEncoder().encode(
            JSON.stringify({ key: toBase64(sealed.key), sender: header.sender }),
          ),
        },
      ]);
    }
    return { envelope, saveKey };
  }

  private async promotePendingKey(message: Message, rev: number): Promise<StoredMessageKey | null> {
    const { keyStore, scope } = this.identity;
    if (message.text === null) return null;
    const id = JSON.stringify([message.id, rev, await sha256Base64(message.text)]);
    const data = await keyStore.getRecord(scope, "pendingKeys", id);
    if (data === null) return null;
    const pending = JSON.parse(new TextDecoder().decode(data)) as {
      key: string;
      sender: MessageKeySender;
    };
    const stored = { key: fromBase64(pending.key), sender: pending.sender };
    await this.saveMessageKey({ id: message.id, rev }, stored);
    return stored;
  }

  private async saveMessageKey(ref: MessageKeyRef, stored: StoredMessageKey): Promise<void> {
    const { keyStore, scope } = this.identity;
    try {
      await keyStore.commitTransaction(scope, { messageKeys: [{ ref, ...stored }] });
    } catch (error) {
      const existing = await keyStore.getMessageKey(scope, ref);
      const same =
        existing !== null &&
        existing.key.length === stored.key.length &&
        existing.key.every((byte, i) => byte === stored.key[i]);
      if (!same) throw error;
    }
  }

  private async removeRevokedLocked(): Promise<void> {
    const { engine } = this.identity;
    const trust = await this.trustOverlay();
    const attempted = new Set<string>();
    for (;;) {
      const target = await this.revokedMember(trust, attempted);
      if (target === null) return;
      attempted.add(revokedKey(target));
      const progress = await this.readyProgress();
      const groupId = progress.groupId as string;
      try {
        await this.commitLocked(
          async () => {
            const current = (await this.loadProgress()).roster.find(
              (m) => revokedKey(m) === revokedKey(target),
            );
            if (current === undefined) throw new NothingToCommit();
            const staged = await this.identity.withState((s) =>
              engine.removeMember(s, groupId, current.leafIndex),
            );
            const removed = staged.removed.map((m) => revokedKey(m.credential));
            if (removed.length !== 1 || removed[0] !== revokedKey(target)) {
              await engine.discard(staged);
              throw new CommitRejectedError("removal_target_mismatch");
            }
            return staged;
          },
          { groupId, generation: progress.generation, create: false },
        );
      } catch (error) {
        if (!(error instanceof NothingToCommit)) throw error;
      }
    }
  }

  private async revokedMember(
    trust: TrustOverlay,
    attempted: Set<string>,
  ): Promise<RosterEntry | null> {
    const progress = await this.readyProgress();
    for (const member of progress.roster) {
      if (member.deviceId === this.identity.deviceId || attempted.has(revokedKey(member))) continue;
      if (await trust.isRevoked(member)) return member;
    }
    return null;
  }

  private async openStored(
    message: Message,
    envelope: Envelope,
    rev: number,
    stored: StoredMessageKey,
  ): Promise<DecryptResult> {
    if (message.createdBy?.id !== stored.sender.userId) return { tampered: "author" };
    const expected: MessageHeader = {
      id: message.id,
      rev,
      parent: message.parent?.id ?? null,
      conv: this.conversation.id,
      g: envelope.g,
      sender: stored.sender,
    };
    const payload = await openContent(stored.key, envelope.n, envelope.c, expected);
    if (payload === null || !sameHeader(payload.h, expected))
      return { tampered: "header_mismatch" };
    return { text: payload.t };
  }

  private async decryptLocked(
    message: Message,
    envelope: Envelope,
    rev: number,
  ): Promise<DecryptResult> {
    const { engine } = this.identity;
    const attempt = async () => {
      const progress = await this.loadProgress();
      if (progress.groupId === null || envelope.g !== progress.generation) return null;
      const groupId = progress.groupId;
      try {
        return await this.identity.withState(
          (s) => engine.decrypt(s, groupId, envelope.m),
          (r) => r.state,
        );
      } catch {
        return null;
      }
    };
    let decrypted = await attempt();
    if (decrypted === null && (await this.serverIsAhead())) {
      await this.syncLocked().catch(() => undefined);
      decrypted = await attempt();
    }
    if (decrypted === null) return { unreadable: true };
    const { sender, receipt } = decrypted;
    let keyMessage: { key: Uint8Array; header: MessageHeader };
    try {
      keyMessage = decodeKeyMessage(decrypted.data);
    } catch {
      await engine.acknowledgeDecrypt(receipt);
      return { tampered: "malformed" };
    }
    const trust = await this.trustOverlay();
    const check = await this.validate(trust, sender);
    const pin = await trust.pinned(sender.accountId);
    if (check !== "ok" || pin === undefined) return { tampered: "sender_not_authorised" };
    const verified: MessageKeySender = {
      userId: sender.accountId,
      accountKeyFingerprint: await accountKeyFingerprint(pin.accountPublicKey),
      deviceId: sender.deviceId,
    };
    const header = keyMessage.header;
    const payload = await openContent(keyMessage.key, envelope.n, envelope.c, header);
    if (payload === null) return { tampered: "header_mismatch" };
    const reason = this.headerMismatch(header, payload.h, message, envelope, rev, verified);
    if (reason !== null) return { tampered: reason };
    await this.identity.keyStore.commitTransaction(this.identity.scope, {
      messageKeys: [{ ref: { id: message.id, rev }, key: keyMessage.key, sender: verified }],
    });
    await engine.acknowledgeDecrypt(receipt);
    await this.commitTrust(trust);
    return { text: payload.t };
  }

  private async serverIsAhead(): Promise<boolean> {
    if (this.epochCheck === null || Date.now() - this.epochCheck.at > EPOCH_CHECK_MS) {
      this.epochCheck = {
        at: Date.now(),
        epoch: this.identity.transport
          .fetchGroupState(this.identifier)
          .then((state) => state.epoch),
      };
    }
    const epoch = await this.epochCheck.epoch.catch(() => 0);
    const progress = await this.loadProgress();
    return progress.groupId === null ? epoch > 0 : epoch > progress.epoch;
  }

  private headerMismatch(
    header: MessageHeader,
    inner: MessageHeader,
    message: Message,
    envelope: Envelope,
    rev: number,
    verified: MessageKeySender,
  ): TamperReason | null {
    if (!sameHeader(header, inner)) return "header_mismatch";
    if (
      header.sender.userId !== verified.userId ||
      header.sender.deviceId !== verified.deviceId ||
      header.sender.accountKeyFingerprint !== verified.accountKeyFingerprint ||
      message.createdBy?.id !== verified.userId
    ) {
      return "author";
    }
    if (header.conv !== this.conversation.id) return "other_conversation";
    if (header.id !== message.id) return "replayed";
    if (header.parent !== (message.parent?.id ?? null)) return "reparented";
    if (header.rev !== rev) return "revision";
    if (header.g !== envelope.g) return "generation";
    return null;
  }

  private async assertPeersUnblocked(): Promise<void> {
    const blocked: number[] = [];
    for (const userId of this.participantIds) {
      if (userId === this.identity.userId) continue;
      if ((await this.identity.pins.verification(userId)) === "changed_blocked")
        blocked.push(userId);
    }
    if (blocked.length > 0) throw new PeerIdentityChangedError(blocked);
  }

  private async readyProgress(): Promise<GroupProgress> {
    const progress = await this.loadProgress();
    if (progress.removed) throw new ConversationNotReadyError("removed");
    if (progress.groupId === null) throw new ConversationNotReadyError("awaiting_welcome");
    return progress;
  }

  private async loadProgress(): Promise<GroupProgress> {
    const data = await this.identity.keyStore.getRecord(
      this.identity.scope,
      "groups",
      this.identifier,
    );
    return data === null ? emptyProgress(this.conversation.id) : decodeProgress(data);
  }

  private saveProgress(progress: GroupProgress): Promise<void> {
    return this.identity.keyStore.commitTransaction(this.identity.scope, {
      records: [{ kind: "groups", id: this.identifier, data: encodeProgress(progress) }],
    });
  }

  private validator(trust: TrustOverlay) {
    return createCredentialValidator({
      server: this.identity.server,
      pins: trust,
      revocations: trust,
    });
  }

  private validate(trust: TrustOverlay, credential: Credential): Promise<CredentialCheck> {
    return this.validator(trust)(credential, {
      conversationId: this.conversation.id,
      expectedUserIds: this.participantIds,
    });
  }

  private async trustOverlay(): Promise<TrustOverlay> {
    if (this.trust === null || Date.now() - this.trustAt > TRUST_REFRESH_MS) {
      this.trust = await this.prepareTrust();
      this.trustAt = Date.now();
    }
    return this.trust;
  }

  private async prepareTrust(): Promise<TrustOverlay> {
    const { pins, transport, revocations } = this.identity;
    const overlay = new TrustOverlay(pins, revocations);
    for (const userId of this.participantIds) {
      if (userId === this.identity.userId) {
        if (!(await pins.has(userId))) {
          await pins.pin(
            userId,
            this.identity.accountPublicKey,
            this.identity.credential.generation,
          );
        }
        await revocations.merge(userId, await transport.fetchUserRevocations(userId));
        continue;
      }
      const devices = await transport.fetchUserDevices(userId);
      if (devices.accountPublicKey === null || devices.generation === null) continue;
      const check = await pins.check(userId, devices.accountPublicKey, devices.generation);
      if (check === "new") {
        const pin = { accountPublicKey: devices.accountPublicKey, generation: devices.generation };
        overlay.tentative.set(userId, pin);
        const signer = { server: this.identity.server, accountId: userId, pin };
        for (const revocation of await transport.fetchUserRevocations(userId)) {
          if (await verifyRevocation(revocation, signer)) {
            overlay.tentativeRevoked.add(revokedKey({ ...revocation, accountId: userId }));
          }
        }
        continue;
      }
      await revocations.merge(userId, await transport.fetchUserRevocations(userId));
    }
    return overlay;
  }

  private async commitTrust(trust: TrustOverlay): Promise<void> {
    const { pins, transport, revocations } = this.identity;
    for (const [userId, account] of trust.tentative) {
      if (!(await pins.has(userId))) {
        await pins.pin(userId, account.accountPublicKey, account.generation);
        await revocations.merge(userId, await transport.fetchUserRevocations(userId));
      }
    }
    trust.tentative.clear();
  }

  private async checkStaged(
    trust: TrustOverlay,
    staged: Staged,
    expectedActor: string | null,
  ): Promise<string | null> {
    if (expectedActor !== null && staged.actor.deviceId !== expectedActor) return "actor_mismatch";
    const actor = await this.validate(trust, staged.actor);
    if (actor !== "ok") return `actor_${actor}`;
    for (const member of staged.added) {
      const added = await this.validate(trust, member.credential);
      if (added !== "ok") return `added_${added}`;
    }
    const participants = new Set(this.participantIds);
    const devices = new Set<string>();
    for (const member of staged.resultingRoster) {
      if (!participants.has(member.credential.accountId)) return "roster_not_a_participant";
      if (devices.has(member.credential.deviceId)) return "roster_duplicate_device";
      devices.add(member.credential.deviceId);
    }
    return null;
  }

  private async checkJoinedRoster(trust: TrustOverlay, staged: Staged): Promise<string | null> {
    const actor = await this.validate(trust, staged.actor);
    if (actor !== "ok") return `actor_${actor}`;
    if (!staged.resultingRoster.some((m) => m.credential.deviceId === this.identity.deviceId)) {
      return "roster_missing_self";
    }
    const devices = new Set<string>();
    for (const member of staged.resultingRoster) {
      if (devices.has(member.credential.deviceId)) return "roster_duplicate_device";
      devices.add(member.credential.deviceId);
      if (member.credential.deviceId === this.identity.deviceId) continue;
      const check = await this.validate(trust, member.credential);
      if (check !== "ok" && check !== "revoked") return `roster_${check}`;
    }
    return null;
  }

  private async syncLocked(): Promise<number> {
    await this.recoverLocked();
    await this.trustOverlay();
    const state = await this.identity.transport.fetchGroupState(this.identifier);
    this.serverFrozen = state.frozenGenerations;
    const progress = await this.loadProgress();
    if (progress.groupId === null && state.epoch > 0) {
      for await (const welcome of this.identity.undeliveredWelcomes()) {
        if (welcome.conversation === this.identifier) await this.joinWelcomeLocked(welcome);
      }
    }
    await this.applyCommitsLocked();
    return state.epoch;
  }

  private async recoverLocked(): Promise<void> {
    const progress = await this.loadProgress();
    const pending = progress.pending;
    const stages = await this.identity.engine.pendingStages();
    for (const stage of stages) {
      if (stage.groupId === progress.groupId && stage.id !== pending?.stageId) {
        await this.identity.engine.discard(stage);
      }
    }
    if (pending === null) return;
    const live = stages.some((stage) => stage.id === pending.stageId);
    if (pending.kind === "own") {
      if (!live) {
        const commits = await this.identity.transport.fetchCommits(
          this.identifier,
          pending.epoch - 1,
        );
        const accepted = commits[0]?.commitId === pending.submission?.commitId;
        await this.saveProgress(
          accepted ? this.applied(progress, pending) : { ...progress, pending: null },
        );
        return;
      }
      try {
        await this.submit(pending.submission as CommitSubmission);
      } catch (error) {
        if (!(error instanceof StaleEpochError)) throw error;
        await this.saveProgress({ ...progress, pending: null });
        await this.identity.engine.discard({ id: pending.stageId });
        return;
      }
    }
    if (live) await this.identity.merge({ id: pending.stageId });
    await this.saveProgress(this.applied(progress, pending));
    if (pending.welcomeId !== undefined) {
      await this.identity.transport.acknowledgeWelcome(pending.welcomeId);
    }
  }

  private applied(progress: GroupProgress, pending: PendingStage): GroupProgress {
    return {
      ...progress,
      removed:
        pending.roster === undefined
          ? progress.removed
          : !pending.roster.some((m) => m.deviceId === this.identity.deviceId),
      groupId: pending.groupId,
      generation: pending.generation,
      epoch: pending.epoch,
      roster: pending.roster ?? progress.roster,
      mlsEpoch: pending.mlsEpoch ?? progress.mlsEpoch,
      pending: null,
    };
  }

  private async joinWelcomeLocked(welcome: Welcome): Promise<boolean> {
    const { engine, transport } = this.identity;
    const progress = await this.loadProgress();
    if (
      welcome.deviceId !== this.identity.deviceId ||
      (progress.groupId !== null && progress.generation >= welcome.generation)
    ) {
      await transport.acknowledgeWelcome(welcome.id);
      return false;
    }
    let staged: Staged;
    try {
      staged = await this.identity.withState((s) => engine.joinFromWelcome(s, welcome.data));
    } catch (error) {
      if (error instanceof Error && error.message.includes("already in the conversation")) {
        await transport.acknowledgeWelcome(welcome.id);
      }
      return false;
    }
    const trust = await this.trustOverlay();
    const reason = !staged.groupId.startsWith(`${this.conversation.id}.${welcome.generation}.`)
      ? "welcome_wrong_group"
      : welcome.generation === 1 && staged.newEpoch !== welcome.epoch
        ? "welcome_epoch_mismatch"
        : await this.checkJoinedRoster(trust, staged);
    if (reason !== null) {
      await engine.discard(staged);
      if (reason.endsWith("identity_changed")) return false;
      await transport.acknowledgeWelcome(welcome.id);
      throw new CommitRejectedError(reason);
    }
    const pending: PendingStage = {
      kind: "welcome",
      stageId: staged.id,
      groupId: staged.groupId,
      epoch: welcome.epoch,
      generation: welcome.generation,
      welcomeId: welcome.id,
      roster: rosterOf(staged),
      mlsEpoch: staged.newEpoch,
    };
    await this.saveProgress({ ...progress, pending });
    await this.identity.merge(staged);
    await this.saveProgress(this.applied(progress, pending));
    await this.commitTrust(trust);
    await transport.acknowledgeWelcome(welcome.id);
    this.identity.notifyChange();
    return true;
  }

  private async applyCommitsLocked(): Promise<void> {
    const { engine, transport } = this.identity;
    for (;;) {
      let progress = await this.loadProgress();
      if (progress.groupId === null || progress.removed) return;
      const commits = await transport.fetchCommits(this.identifier, progress.epoch);
      for (const commit of commits) {
        progress = await this.loadProgress();
        if (commit.epoch <= progress.epoch) continue;
        if (commit.epoch !== progress.epoch + 1) throw new CommitRejectedError("epoch_gap");
        if (commit.generation > progress.generation) {
          if (!progress.frozen.some((f) => f.generation === progress.generation)) {
            await this.saveProgress({
              ...progress,
              frozen: [
                ...progress.frozen,
                { generation: progress.generation, at: commit.createdAt },
              ],
            });
          }
          return;
        }
        if (commit.generation < progress.generation)
          throw new CommitRejectedError("old_generation");
        const groupId = progress.groupId as string;
        let staged: Staged;
        try {
          staged = await this.identity.withState((s) =>
            engine.stageIncomingCommit(s, groupId, commit.commit),
          );
        } catch {
          throw new CommitRejectedError("unreadable_commit");
        }
        const trust = await this.trustOverlay();
        const reason =
          progress.mlsEpoch !== null && staged.newEpoch !== progress.mlsEpoch + 1
            ? "epoch_mismatch"
            : await this.checkStaged(trust, staged, commit.deviceId);
        if (reason !== null) {
          await engine.discard(staged);
          throw new CommitRejectedError(reason);
        }
        const pending: PendingStage = {
          kind: "incoming",
          stageId: staged.id,
          groupId,
          epoch: commit.epoch,
          generation: commit.generation,
          roster: rosterOf(staged),
          mlsEpoch: staged.newEpoch,
        };
        await this.saveProgress({ ...progress, pending });
        await this.identity.merge(staged);
        const stillIn = staged.resultingRoster.some(
          (m) => m.credential.deviceId === this.identity.deviceId,
        );
        await this.saveProgress(this.applied(progress, pending));
        await this.commitTrust(trust);
        this.identity.notifyChange();
        if (!stillIn) return;
      }
      if (commits.length < MAX_COMMIT_PAGE) return;
    }
  }

  private async initialiseLocked(): Promise<void> {
    const { engine, transport } = this.identity;
    const trust = await this.trustOverlay();
    const groupId = `${this.conversation.id}.1.${crypto.randomUUID()}`;
    const created = await this.identity.withState((s) => engine.createGroup(s, groupId));
    await this.identity.merge(created);
    const packages: Uint8Array[] = [];
    const unreachable: number[] = [];
    for (const userId of this.participantIds) {
      let usable = 0;
      for (const claimed of await transport.claimKeyPackages(userId)) {
        if (claimed.deviceId === this.identity.deviceId) continue;
        const credential = await engine.inspectKeyPackage(claimed.keyPackage);
        if (credential.deviceId !== claimed.deviceId || credential.accountId !== userId) continue;
        if ((await this.validate(trust, credential)) !== "ok") continue;
        packages.push(claimed.keyPackage);
        usable += 1;
      }
      if (usable === 0 && userId !== this.identity.userId) unreachable.push(userId);
    }
    if (unreachable.length > 0) throw new ParticipantNotReachableError(unreachable);
    await this.commitLocked(
      () => this.identity.withState((s) => engine.addMembers(s, groupId, packages)),
      { groupId, generation: 1, create: true },
    );
  }

  private async commitLocked(
    build: () => Promise<Staged>,
    target: { groupId: string; generation: number; create: boolean },
  ): Promise<void> {
    const { engine } = this.identity;
    for (let attempt = 0; attempt < 2; attempt++) {
      const progress = await this.loadProgress();
      const epoch = target.create ? 1 : progress.epoch + 1;
      const staged = await build();
      const reason =
        staged.commit === null || staged.groupInfo === null
          ? "no_commit"
          : await this.checkStaged(await this.trustOverlay(), staged, this.identity.deviceId);
      if (reason !== null) {
        await engine.discard(staged);
        throw new CommitRejectedError(reason);
      }
      const submission: CommitSubmission = {
        commitId: crypto.randomUUID(),
        deviceId: this.identity.deviceId,
        epoch,
        generation: target.generation,
        commit: staged.commit as Uint8Array,
        groupInfo: staged.groupInfo as Uint8Array,
        welcomes: this.welcomesFor(staged),
      };
      const pending: PendingStage = {
        kind: "own",
        stageId: staged.id,
        groupId: target.groupId,
        epoch,
        generation: target.generation,
        submission,
        roster: rosterOf(staged),
        mlsEpoch: staged.newEpoch,
      };
      await this.saveProgress({ ...progress, pending });
      try {
        await this.submit(submission);
      } catch (error) {
        if (!(error instanceof StaleEpochError)) throw error;
        await this.saveProgress({ ...progress, pending: null });
        await engine.discard(staged);
        if (target.create) {
          await this.syncLocked();
          return;
        }
        await this.applyCommitsLocked();
        continue;
      }
      await this.identity.merge(staged);
      await this.saveProgress(this.applied(progress, pending));
      await this.commitTrust(await this.trustOverlay());
      this.identity.notifyChange();
      return;
    }
    throw new CommitConflictError();
  }

  private welcomesFor(staged: Staged): CommitSubmission["welcomes"] {
    if (staged.added.length === 0) return [];
    const single = staged.welcomes.length === 1 ? staged.welcomes[0] : undefined;
    if (single === undefined && staged.welcomes.length !== staged.added.length) {
      throw new CommitRejectedError("welcome_count");
    }
    return staged.added.map((member, i) => ({
      deviceId: member.credential.deviceId,
      data: (single ?? staged.welcomes[i]) as Uint8Array,
    }));
  }

  private submit(submission: CommitSubmission): Promise<unknown> {
    return this.identity.withNetworkRetry(() =>
      this.identity.transport.submitCommit(this.identifier, submission),
    );
  }
}

export async function createEncryptedConversation(
  identity: E2eeIdentity,
  peerUserId: number,
): Promise<Conversation> {
  const conversation = await identity.transport.createEncryptedConversation([peerUserId]);
  if (conversation.encrypted !== true) {
    throw new Error("the server did not create an encrypted conversation");
  }
  await identity.session(conversation).open();
  return conversation;
}

export function sendEncrypted(
  session: ConversationSession,
  text: string,
  parentIri?: string,
): Promise<Message> {
  return session.send(text, parentIri);
}

export function editEncrypted(
  session: ConversationSession,
  messageIri: string,
  text: string,
): Promise<Message> {
  return session.edit(messageIri, text);
}

export function decryptMessage(
  session: ConversationSession,
  message: Message,
): Promise<DecryptResult> {
  return session.decrypt(message);
}
