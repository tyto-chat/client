export const PEER_SOUND_WINDOW_MS = 300;

const PERSON_IDENTITY_PREFIX = "user-";

export function peerIdentities(identities: readonly string[], ownIdentity: string): Set<string> {
  return new Set(
    identities.filter(
      (identity) => identity.startsWith(PERSON_IDENTITY_PREFIX) && identity !== ownIdentity,
    ),
  );
}

export function countChanges(
  previous: ReadonlySet<string>,
  current: ReadonlySet<string>,
): { joined: number; left: number } {
  let joined = 0;
  let left = 0;
  for (const identity of current) {
    if (!previous.has(identity)) {
      joined += 1;
    }
  }
  for (const identity of previous) {
    if (!current.has(identity)) {
      left += 1;
    }
  }
  return { joined, left };
}

export function createPeerSoundCoalescer(emit: (event: "peer-join" | "peer-leave") => void): {
  report(changes: { joined: number; left: number }): void;
  cancel(): void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let anyJoined = false;
  let anyLeft = false;

  function flush(): void {
    timer = null;
    const joined = anyJoined;
    const left = anyLeft;
    anyJoined = false;
    anyLeft = false;
    if (joined) {
      emit("peer-join");
    }
    if (left) {
      emit("peer-leave");
    }
  }

  return {
    report(changes) {
      if (changes.joined === 0 && changes.left === 0) {
        return;
      }
      anyJoined = anyJoined || changes.joined > 0;
      anyLeft = anyLeft || changes.left > 0;
      if (timer === null) {
        timer = setTimeout(flush, PEER_SOUND_WINDOW_MS);
      }
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      anyJoined = false;
      anyLeft = false;
    },
  };
}

export function callKey(
  call: { identityKey: string | null; communityId: string; channel: { identifier: string } } | null,
): string | null {
  if (call === null) {
    return null;
  }
  return `${call.identityKey ?? ""}:${call.communityId}:${call.channel.identifier}`;
}
