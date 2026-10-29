import type { ConversationPreflight } from "@/api/conversations";
import type { E2eeAvailability } from "./e2eeContextValue";

export type ComposeOutcome =
  | { kind: "encrypted" }
  | { kind: "plain" }
  | { kind: "plain_warning"; unreachableUserIds: number[]; group: boolean }
  | {
      kind: "blocked";
      reason: string | null;
      refusingUserIds: number[];
      unreachableUserIds: number[];
    }
  | { kind: "client_not_ready"; why: "web" | "not_restored" | "other_server" };

export function composeOutcome(
  preflight: ConversationPreflight,
  context: {
    availability: E2eeAvailability;
    recipientCount: number;
    otherServer: boolean;
    mode: string | undefined;
  },
): ComposeOutcome {
  switch (preflight.outcome) {
    case "encrypted":
      if (context.otherServer) return { kind: "client_not_ready", why: "other_server" };
      if (context.availability === "unsupported") return { kind: "client_not_ready", why: "web" };
      if (context.availability === "not_restored") {
        return { kind: "client_not_ready", why: "not_restored" };
      }
      return { kind: "encrypted" };
    case "plain_fallback":
      return {
        kind: "plain_warning",
        unreachableUserIds: preflight.unreachableUserIds,
        group: false,
      };
    case "blocked":
      return {
        kind: "blocked",
        reason: preflight.reason,
        refusingUserIds: preflight.refusingUserIds,
        unreachableUserIds: preflight.unreachableUserIds,
      };
    case "plain":
      return preflight.reason === "operator_disabled" &&
        (context.otherServer || context.mode === "disabled")
        ? { kind: "plain" }
        : { kind: "plain_warning", unreachableUserIds: [], group: context.recipientCount > 1 };
  }
}
