import { describe, expect, it } from "vitest";
import type { ConversationPreflight } from "@/api/conversations";
import { composeOutcome } from "@/e2ee/composeOutcome";

function preflight(over: Partial<ConversationPreflight>): ConversationPreflight {
  return {
    outcome: "encrypted",
    reason: null,
    refusingUserIds: [],
    unreachableUserIds: [],
    existingIdentifier: null,
    ...over,
  };
}

const ready = {
  availability: "ready" as const,
  recipientCount: 1,
  otherServer: false,
  mode: "enabled",
};

describe("compose outcome", () => {
  it("outcome_encrypted_when_everyone_reachable_no_plain_option", () => {
    expect(composeOutcome(preflight({}), ready)).toEqual({ kind: "encrypted" });
  });

  it("web_with_reachable_account_gets_open_desktop_not_plain_fallback", () => {
    expect(composeOutcome(preflight({}), { ...ready, availability: "unsupported" })).toEqual({
      kind: "client_not_ready",
      why: "web",
    });
  });

  it("unrestored_desktop_gets_restore_not_plain_fallback", () => {
    expect(composeOutcome(preflight({}), { ...ready, availability: "not_restored" })).toEqual({
      kind: "client_not_ready",
      why: "not_restored",
    });
  });

  it("plain fallback names the unreachable people", () => {
    expect(
      composeOutcome(preflight({ outcome: "plain_fallback", unreachableUserIds: [7] }), ready),
    ).toEqual({ kind: "plain_warning", unreachableUserIds: [7], group: false });
  });

  it("group_compose_plain_with_warning_when_enabled", () => {
    expect(
      composeOutcome(preflight({ outcome: "plain" }), { ...ready, recipientCount: 2 }),
    ).toEqual({ kind: "plain_warning", unreachableUserIds: [], group: true });
  });

  it("plain without warning only when nothing suggests encryption", () => {
    expect(composeOutcome(preflight({ outcome: "plain" }), { ...ready, mode: "disabled" })).toEqual(
      { kind: "plain" },
    );
  });

  it("blocked outcomes keep the reason and the named people", () => {
    expect(
      composeOutcome(
        preflight({ outcome: "blocked", reason: "participant_refuses", refusingUserIds: [9] }),
        ready,
      ),
    ).toEqual({
      kind: "blocked",
      reason: "participant_refuses",
      refusingUserIds: [9],
      unreachableUserIds: [],
    });
  });
});
