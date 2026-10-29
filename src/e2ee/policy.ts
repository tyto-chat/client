import type { ComposeOutcome } from "./composeOutcome";
import type { LocalSecuritySnapshot } from "./localSecurityState";

export type LocalDecision =
  | { kind: "free" }
  | { kind: "encrypt_only"; because: "self_refuses" | "pinned"; userIds: number[] }
  | { kind: "blocked"; reason: "self_refuses" | "pinned_group"; userIds: number[] };

export function decideLocally({
  security,
  recipientIds,
}: {
  security: LocalSecuritySnapshot | null;
  recipientIds: number[];
}): LocalDecision {
  if (security === null) return { kind: "free" };
  const group = recipientIds.length > 1;
  const pinned = recipientIds.filter((id) => security.pinnedUserIds.has(id));
  if (security.refusal.on) {
    return group
      ? { kind: "blocked", reason: "self_refuses", userIds: [] }
      : { kind: "encrypt_only", because: "self_refuses", userIds: recipientIds };
  }
  if (pinned.length === 0) return { kind: "free" };
  return group
    ? { kind: "blocked", reason: "pinned_group", userIds: pinned }
    : { kind: "encrypt_only", because: "pinned", userIds: pinned };
}

export function enforceLocally(decision: LocalDecision, outcome: ComposeOutcome): ComposeOutcome {
  switch (decision.kind) {
    case "free":
      return outcome;
    case "blocked":
      return {
        kind: "blocked",
        reason: decision.reason,
        refusingUserIds: [],
        unreachableUserIds: decision.userIds,
      };
    case "encrypt_only":
      if (outcome.kind !== "plain" && outcome.kind !== "plain_warning") return outcome;
      return decision.because === "self_refuses"
        ? {
            kind: "blocked",
            reason: "self_refuses",
            refusingUserIds: [],
            unreachableUserIds:
              outcome.kind === "plain_warning" && outcome.unreachableUserIds.length > 0
                ? outcome.unreachableUserIds
                : decision.userIds,
          }
        : {
            kind: "blocked",
            reason: "pinned_unreachable",
            refusingUserIds: [],
            unreachableUserIds: decision.userIds,
          };
  }
}
