import type { KeyStore, KeyStoreScope } from "./keyStore";

export interface RefusalState {
  on: boolean;
  since: number;
}

export interface KnownMessage {
  id: string;
  revisionCount: number;
}

export interface LocalSecuritySnapshot {
  scope: KeyStoreScope;
  refusal: RefusalState;
  knownBeforeRefusal: ReadonlyMap<string, number>;
  acceptedPlainConversations: ReadonlySet<number>;
  pinnedUserIds: ReadonlySet<number>;
}

export type SecurityBackupEntry =
  | { kind: "refusal"; on: boolean; since: number }
  | { kind: "acceptedPlain"; conversationId: number };

const REFUSAL = "refusal";
const KNOWN = "knownBeforeRefusal";
const ACCEPTED_PREFIX = "acceptedPlain:";
const OFF: RefusalState = { on: false, since: 0 };

const encodeJson = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const decodeJson = <T>(data: Uint8Array): T => JSON.parse(new TextDecoder().decode(data)) as T;

export function encodeSecurityBackupEntry(entry: SecurityBackupEntry): Uint8Array {
  return encodeJson(entry);
}

export function decodeSecurityBackupEntry(data: Uint8Array): SecurityBackupEntry | null {
  let value: unknown;
  try {
    value = decodeJson(data);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (entry.kind === "refusal" && typeof entry.on === "boolean" && Number.isInteger(entry.since)) {
    return { kind: "refusal", on: entry.on, since: entry.since as number };
  }
  if (entry.kind === "acceptedPlain" && Number.isInteger(entry.conversationId)) {
    return { kind: "acceptedPlain", conversationId: entry.conversationId as number };
  }
  return null;
}

function wins(incoming: RefusalState, current: RefusalState): boolean {
  if (incoming.since !== current.since) return incoming.since > current.since;
  return incoming.on && !current.on;
}

export class LocalSecurityState {
  private readonly store: KeyStore;
  private current: LocalSecuritySnapshot;
  private readonly listeners = new Set<() => void>();

  private constructor(store: KeyStore, scope: KeyStoreScope) {
    this.store = store;
    this.current = {
      scope,
      refusal: OFF,
      knownBeforeRefusal: new Map(),
      acceptedPlainConversations: new Set(),
      pinnedUserIds: new Set(),
    };
  }

  static async open(store: KeyStore, scope: KeyStoreScope): Promise<LocalSecurityState> {
    const state = new LocalSecurityState(store, scope);
    await state.load();
    return state;
  }

  get scope(): KeyStoreScope {
    return this.current.scope;
  }

  snapshot(): LocalSecuritySnapshot {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async turnRefusalOn(known: Iterable<KnownMessage>): Promise<void> {
    if (this.current.refusal.on) return;
    await this.setRefusal(true, known, true);
  }

  async turnRefusalOff(): Promise<void> {
    if (!this.current.refusal.on) return;
    await this.setRefusal(false, [], true);
  }

  async acceptPlainConversation(conversationId: number): Promise<void> {
    if (this.current.acceptedPlainConversations.has(conversationId)) return;
    await this.recordAccepted(conversationId, true);
  }

  async applyBackupEntry(
    entry: SecurityBackupEntry,
    known: () => Iterable<KnownMessage>,
  ): Promise<void> {
    if (entry.kind === "acceptedPlain") {
      if (!this.current.acceptedPlainConversations.has(entry.conversationId)) {
        await this.recordAccepted(entry.conversationId, false);
      }
      return;
    }
    if (!wins(entry, this.current.refusal)) return;
    if (entry.on && !this.current.refusal.on) await this.saveKnown(known());
    const refusal = await this.store.updateRecord(this.scope, "security", REFUSAL, (data) => {
      const stored = data === null ? OFF : decodeJson<RefusalState>(data);
      const next = wins(entry, stored) ? { on: entry.on, since: entry.since } : stored;
      return { data: encodeJson(next), result: next };
    });
    await this.reloadAfter({ refusal });
  }

  async refreshPins(): Promise<void> {
    const records = await this.store.loadRecords(this.scope, "pins");
    const next = new Set(records.map((r) => Number(r.id)));
    const current = this.current.pinnedUserIds;
    if (next.size === current.size && [...next].every((id) => current.has(id))) return;
    this.update({ pinnedUserIds: next });
  }

  private async setRefusal(
    on: boolean,
    known: Iterable<KnownMessage>,
    backedUp: boolean,
  ): Promise<void> {
    if (on) await this.saveKnown(known);
    const refusal = await this.store.updateRecord(this.scope, "security", REFUSAL, (data) => {
      const stored = data === null ? OFF : decodeJson<RefusalState>(data);
      if (stored.on === on) return { data: null, result: stored };
      const next = { on, since: stored.since + 1 };
      return {
        data: encodeJson(next),
        result: next,
        backupRecords: backedUp
          ? [encodeSecurityBackupEntry({ kind: "refusal", ...next })]
          : undefined,
      };
    });
    await this.reloadAfter({ refusal });
  }

  private async saveKnown(known: Iterable<KnownMessage>): Promise<void> {
    const entries = [...known].map((m) => [m.id, m.revisionCount] as const);
    await this.store.putRecords(this.scope, "security", [{ id: KNOWN, data: encodeJson(entries) }]);
  }

  private async recordAccepted(conversationId: number, backedUp: boolean): Promise<void> {
    await this.store.updateRecord(
      this.scope,
      "security",
      `${ACCEPTED_PREFIX}${conversationId}`,
      (data) =>
        data !== null
          ? { data: null, result: undefined }
          : {
              data: encodeJson(true),
              result: undefined,
              backupRecords: backedUp
                ? [encodeSecurityBackupEntry({ kind: "acceptedPlain", conversationId })]
                : undefined,
            },
    );
    const accepted = new Set(this.current.acceptedPlainConversations);
    accepted.add(conversationId);
    this.update({ acceptedPlainConversations: accepted });
  }

  private async reloadAfter(change: { refusal: RefusalState }): Promise<void> {
    const known = change.refusal.on ? await this.readKnown() : new Map<string, number>();
    this.update({ refusal: change.refusal, knownBeforeRefusal: known });
  }

  private async readKnown(): Promise<Map<string, number>> {
    const data = await this.store.getRecord(this.scope, "security", KNOWN);
    return new Map(data === null ? [] : decodeJson<[string, number][]>(data));
  }

  private async load(): Promise<void> {
    const records = await this.store.loadRecords(this.scope, "security");
    const pins = await this.store.loadRecords(this.scope, "pins");
    const byId = new Map(records.map((r) => [r.id, r.data]));
    const refusalData = byId.get(REFUSAL);
    const refusal = refusalData === undefined ? OFF : decodeJson<RefusalState>(refusalData);
    const knownData = byId.get(KNOWN);
    this.current = {
      ...this.current,
      refusal,
      knownBeforeRefusal: new Map(
        refusal.on && knownData !== undefined ? decodeJson<[string, number][]>(knownData) : [],
      ),
      acceptedPlainConversations: new Set(
        records
          .filter((r) => r.id.startsWith(ACCEPTED_PREFIX))
          .map((r) => Number(r.id.slice(ACCEPTED_PREFIX.length))),
      ),
      pinnedUserIds: new Set(pins.map((r) => Number(r.id))),
    };
  }

  private update(patch: Partial<LocalSecuritySnapshot>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener();
  }
}
