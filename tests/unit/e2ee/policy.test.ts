import { describe, expect, it } from "vitest";
import { composeOutcome, type ComposeOutcome } from "@/e2ee/composeOutcome";
import { decideLocally, enforceLocally } from "@/e2ee/policy";
import type { LocalSecuritySnapshot } from "@/e2ee/localSecurityState";
import type { ConversationPreflight } from "@/api/conversations";

function snapshot(patch: Partial<LocalSecuritySnapshot> = {}): LocalSecuritySnapshot {
  return {
    scope: { serverOrigin: "https://chat.example.org", serverUserId: 1, profileId: "p" },
    refusal: { on: false, since: 0 },
    knownBeforeRefusal: new Map(),
    acceptedPlainConversations: new Set(),
    pinnedUserIds: new Set(),
    ...patch,
  };
}

const preflight = (patch: Partial<ConversationPreflight>): ConversationPreflight => ({
  outcome: "encrypted",
  reason: null,
  refusingUserIds: [],
  unreachableUserIds: [],
  existingIdentifier: null,
  ...patch,
});

const ready = { availability: "ready" as const, otherServer: false };

function decide(
  local: LocalSecuritySnapshot | null,
  recipients: number[],
  server: ConversationPreflight,
  mode: string = "enabled",
): ComposeOutcome {
  const decision = decideLocally({ security: local, recipientIds: recipients });
  return enforceLocally(
    decision,
    composeOutcome(server, { ...ready, recipientCount: recipients.length, mode }),
  );
}

describe("decideLocally", () => {
  it("is free without local security state", () => {
    expect(decideLocally({ security: null, recipientIds: [2] })).toEqual({ kind: "free" });
  });

  it("pinned_peer_never_offered_plain_even_if_server_reports_no_devices", () => {
    const outcome = decide(
      snapshot({ pinnedUserIds: new Set([2]) }),
      [2],
      preflight({ outcome: "plain_fallback", unreachableUserIds: [2] }),
    );

    expect(outcome).toEqual({
      kind: "blocked",
      reason: "pinned_unreachable",
      refusingUserIds: [],
      unreachableUserIds: [2],
    });
  });

  it("pinned_peer_encrypted_failure_reports_not_falls_back", () => {
    const local = snapshot({ pinnedUserIds: new Set([2]) });

    expect(decide(local, [2], preflight({ outcome: "encrypted" })).kind).toBe("encrypted");
    expect(
      decide(local, [2], preflight({ outcome: "plain_fallback", unreachableUserIds: [2] })).kind,
    ).toBe("blocked");
  });

  it("pinned_peer_blocks_new_plain_under_disabled_mode", () => {
    const outcome = decide(
      snapshot({ pinnedUserIds: new Set([2]) }),
      [2],
      preflight({ outcome: "plain", reason: "operator_disabled" }),
      "disabled",
    );

    expect(outcome.kind).toBe("blocked");
  });

  it("pinned_peer_blocks_new_plain_group", () => {
    const outcome = decide(
      snapshot({ pinnedUserIds: new Set([3]) }),
      [2, 3],
      preflight({ outcome: "plain" }),
    );

    expect(outcome).toEqual({
      kind: "blocked",
      reason: "pinned_group",
      refusingUserIds: [],
      unreachableUserIds: [3],
    });
  });

  it("unpinned_peer_follows_server_outcome", () => {
    const server = preflight({ outcome: "plain_fallback", unreachableUserIds: [2] });

    expect(decide(snapshot({ pinnedUserIds: new Set([9]) }), [2], server)).toEqual({
      kind: "plain_warning",
      unreachableUserIds: [2],
      group: false,
    });
  });

  it("own refusal blocks any plain outcome and every group", () => {
    const local = snapshot({ refusal: { on: true, since: 1 } });

    expect(decide(local, [2], preflight({ outcome: "plain_fallback" })).kind).toBe("blocked");
    expect(decide(local, [2], preflight({ outcome: "encrypted" })).kind).toBe("encrypted");
    expect(decide(local, [2, 3], preflight({ outcome: "plain" }))).toMatchObject({
      kind: "blocked",
      reason: "self_refuses",
    });
  });

  it("server_required_but_client_told_enabled_still_no_silent_plain", () => {
    expect(decide(null, [2], preflight({ outcome: "plain" }), "enabled")).toEqual({
      kind: "plain_warning",
      unreachableUserIds: [],
      group: false,
    });
    expect(decide(null, [2], preflight({ outcome: "plain" }), "disabled").kind).toBe(
      "plain_warning",
    );
    expect(
      decide(null, [2], preflight({ outcome: "plain", reason: "operator_disabled" }), "disabled"),
    ).toEqual({ kind: "plain" });
  });

  it("does not let an encrypted-only decision unlock a client that is not ready", () => {
    const decision = decideLocally({
      security: snapshot({ pinnedUserIds: new Set([2]) }),
      recipientIds: [2],
    });
    const notReady = composeOutcome(preflight({ outcome: "encrypted" }), {
      availability: "not_restored",
      otherServer: false,
      recipientCount: 1,
      mode: "enabled",
    });

    expect(enforceLocally(decision, notReady)).toEqual(notReady);
  });
});
