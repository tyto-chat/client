import type { Credential, Member, MlsEngine, Staged } from "@/e2ee/engine";

interface FakeGroup {
  epoch: number;
  members: Member[];
}

interface FakeState {
  token: string;
  groups: Record<string, FakeGroup>;
}

interface WireCredential extends Omit<Credential, "devicePublicKey" | "signature"> {
  devicePublicKey: number[];
  signature: number[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const pack = (value: unknown) => encoder.encode(JSON.stringify(value));
const unpack = <T>(bytes: Uint8Array): T => JSON.parse(decoder.decode(bytes)) as T;

const wire = (c: Credential): WireCredential => ({
  ...c,
  devicePublicKey: Array.from(c.devicePublicKey),
  signature: Array.from(c.signature),
});
const unwire = (c: WireCredential): Credential => ({
  ...c,
  devicePublicKey: Uint8Array.from(c.devicePublicKey),
  signature: Uint8Array.from(c.signature),
});
const wireMembers = (members: Member[]) =>
  members.map((m) => ({ leafIndex: m.leafIndex, credential: wire(m.credential) }));
const unwireMembers = (members: { leafIndex: number; credential: WireCredential }[]): Member[] =>
  members.map((m) => ({ leafIndex: m.leafIndex, credential: unwire(m.credential) }));

let tokens = 0;

export function createFakeMlsEngine(self: Credential): MlsEngine & { latest: () => Uint8Array } {
  let latest: FakeState | null = null;
  const staged = new Map<string, { groupId: string; state: FakeState; base: string }>();

  const fresh = (groups: Record<string, FakeGroup>): FakeState => ({
    token: `t${(tokens += 1)}`,
    groups,
  });
  const encode = (state: FakeState) =>
    pack({
      ...state,
      groups: Object.fromEntries(
        Object.entries(state.groups).map(([k, g]) => [
          k,
          { epoch: g.epoch, members: wireMembers(g.members) },
        ]),
      ),
    });
  const decode = (bytes: Uint8Array): FakeState => {
    const raw = unpack<{
      token: string;
      groups: Record<
        string,
        { epoch: number; members: { leafIndex: number; credential: WireCredential }[] }
      >;
    }>(bytes);
    return {
      token: raw.token,
      groups: Object.fromEntries(
        Object.entries(raw.groups).map(([k, g]) => [
          k,
          { epoch: g.epoch, members: unwireMembers(g.members) },
        ]),
      ),
    };
  };
  const open = (bytes: Uint8Array): FakeState => {
    const state = decode(bytes);
    if (latest !== null && state.token !== latest.token) throw new Error("stale device state");
    return state;
  };
  const accept = (state: FakeState) => {
    latest = state;
    return encode(state);
  };
  const requireSettled = (groupId: string) => {
    for (const pending of staged.values()) {
      if (pending.groupId === groupId) throw new Error("this conversation has a pending stage");
    }
  };
  const selfMember = (leafIndex: number): Member => ({ credential: self, leafIndex });
  const stage = (
    state: FakeState,
    groupId: string,
    next: FakeGroup | null,
    extra: Partial<Staged> & { actor: Credential },
  ): Staged => {
    requireSettled(groupId);
    const before = state.groups[groupId]?.members ?? [];
    const after = next?.members ?? before.filter((m) => m.credential.deviceId !== self.deviceId);
    const groups = { ...state.groups };
    if (next === null) delete groups[groupId];
    else groups[groupId] = next;
    const id = crypto.randomUUID();
    staged.set(id, { groupId, state: fresh(groups), base: state.token });
    return {
      id,
      groupId,
      commit: null,
      groupInfo:
        next === null
          ? null
          : pack({ groupId, epoch: next.epoch, members: wireMembers(next.members) }),
      added: after.filter(
        (m) =>
          !before.some(
            (b) => b.leafIndex === m.leafIndex && b.credential.deviceId === m.credential.deviceId,
          ),
      ),
      removed: before.filter(
        (b) =>
          !after.some(
            (m) => m.leafIndex === b.leafIndex && m.credential.deviceId === b.credential.deviceId,
          ),
      ),
      resultingRoster: after,
      newEpoch: next?.epoch ?? (state.groups[groupId]?.epoch ?? 0) + 1,
      welcomes: [],
      ...extra,
    };
  };
  const group = (state: FakeState, groupId: string): FakeGroup => {
    const found = state.groups[groupId];
    if (found === undefined) throw new Error("unknown group");
    return found;
  };

  return {
    latest: () => encode(latest ?? fresh({})),
    createDeviceKey: async () => ({ devicePublicKey: self.devicePublicKey }),
    generateDevice: async () => ({ state: accept(fresh({})) }),
    latestState: async () => (latest === null ? null : { state: encode(latest) }),
    pendingStages: async () => [...staged.entries()].map(([id, s]) => ({ id, groupId: s.groupId })),
    createKeyPackages: async (state, count) => ({
      packages: Array.from({ length: count }, (_, i) => pack({ credential: wire(self), n: i })),
      lastResort: pack({ credential: wire(self), lastResort: true }),
      state: accept(fresh(open(state).groups)),
    }),
    inspectKeyPackage: async (keyPackage) =>
      unwire(unpack<{ credential: WireCredential }>(keyPackage).credential),
    inspectGroupInfo: async (groupInfo) => {
      const info = unpack<{
        groupId: string;
        epoch: number;
        members: { leafIndex: number; credential: WireCredential }[];
      }>(groupInfo);
      return { groupId: info.groupId, epoch: info.epoch, members: unwireMembers(info.members) };
    },
    createGroup: async (state, groupId) => {
      const current = open(state);
      if (current.groups[groupId] !== undefined) throw new Error("group already exists");
      return stage(current, groupId, { epoch: 0, members: [selfMember(0)] }, { actor: self });
    },
    addMembers: async (state, groupId, keyPackages) => {
      const current = open(state);
      const existing = group(current, groupId);
      const added = keyPackages.map((kp, i) => ({
        credential: unwire(unpack<{ credential: WireCredential }>(kp).credential),
        leafIndex: existing.members.length + i,
      }));
      const next = { epoch: existing.epoch + 1, members: [...existing.members, ...added] };
      const commit = pack({
        groupId,
        epoch: next.epoch,
        members: wireMembers(next.members),
        actor: wire(self),
      });
      const welcomes = added.map(() =>
        pack({ groupId, epoch: next.epoch, members: wireMembers(next.members), actor: wire(self) }),
      );
      return stage(current, groupId, next, { actor: self, commit, welcomes });
    },
    joinFromWelcome: async (state, welcome) => {
      const current = open(state);
      const info = unpack<{
        groupId: string;
        epoch: number;
        members: { leafIndex: number; credential: WireCredential }[];
        actor: WireCredential;
      }>(welcome);
      if (current.groups[info.groupId] !== undefined)
        throw new Error("this device is already in the conversation");
      return stage(
        current,
        info.groupId,
        { epoch: info.epoch, members: unwireMembers(info.members) },
        { actor: unwire(info.actor) },
      );
    },
    joinExternal: async (state, groupInfo) => {
      const current = open(state);
      const info = unpack<{
        groupId: string;
        epoch: number;
        members: { leafIndex: number; credential: WireCredential }[];
      }>(groupInfo);
      if (current.groups[info.groupId] !== undefined)
        throw new Error("this device is already in the conversation");
      const members = [...unwireMembers(info.members), selfMember(info.members.length)];
      const next = { epoch: info.epoch + 1, members };
      const commit = pack({
        groupId: info.groupId,
        epoch: next.epoch,
        members: wireMembers(members),
        actor: wire(self),
      });
      return stage(current, info.groupId, next, { actor: self, commit });
    },
    removeMember: async (state, groupId, leafIndex) => {
      const current = open(state);
      const existing = group(current, groupId);
      const next = {
        epoch: existing.epoch + 1,
        members: existing.members.filter((m) => m.leafIndex !== leafIndex),
      };
      const commit = pack({
        groupId,
        epoch: next.epoch,
        members: wireMembers(next.members),
        actor: wire(self),
      });
      return stage(current, groupId, next, { actor: self, commit });
    },
    stageIncomingCommit: async (state, groupId, commit) => {
      const current = open(state);
      const existing = group(current, groupId);
      const info = unpack<{
        epoch: number;
        members: { leafIndex: number; credential: WireCredential }[];
        actor: WireCredential;
      }>(commit);
      if (info.epoch !== existing.epoch + 1) throw new Error("commit is not for the next epoch");
      const members = unwireMembers(info.members);
      const stillIn = members.some((m) => m.credential.deviceId === self.deviceId);
      return stage(current, groupId, stillIn ? { epoch: info.epoch, members } : null, {
        actor: unwire(info.actor),
      });
    },
    merge: async ({ id }) => {
      const pending = staged.get(id);
      if (pending === undefined) throw new Error("unknown or already settled stage");
      staged.delete(id);
      if (latest !== null && latest.token !== pending.base) throw new Error("stale stage");
      return { state: accept(pending.state) };
    },
    discard: async ({ id }) => void staged.delete(id),
    encrypt: async (state, groupId, data) => {
      const current = open(state);
      requireSettled(groupId);
      const { epoch } = group(current, groupId);
      return {
        state: accept(fresh(current.groups)),
        message: pack({ groupId, epoch, sender: wire(self), data: Array.from(data) }),
      };
    },
    decrypt: async (state, groupId, message) => {
      const current = open(state);
      requireSettled(groupId);
      const { epoch, members } = group(current, groupId);
      const parsed = unpack<{
        groupId: string;
        epoch: number;
        sender: WireCredential;
        data: number[];
      }>(message);
      if (parsed.groupId !== groupId || parsed.epoch !== epoch)
        throw new Error("message is not for this epoch");
      if (!members.some((m) => m.credential.deviceId === parsed.sender.deviceId))
        throw new Error("No member found");
      return {
        state: accept(fresh(current.groups)),
        data: Uint8Array.from(parsed.data),
        sender: unwire(parsed.sender),
      };
    },
    signKeyPackageUpload: async () => new Uint8Array(64),
    signRevocation: async () => new Uint8Array(64),
  };
}
