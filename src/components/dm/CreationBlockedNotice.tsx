import { useTranslation } from "react-i18next";
import { AlertTriangleIcon } from "@/components/icons";
import type { ComposeOutcome } from "@/e2ee/composeOutcome";

type Blocking = Extract<ComposeOutcome, { kind: "blocked" | "client_not_ready" }>;

interface Props {
  outcome: Blocking;
  names: (userIds: number[]) => string;
  group: boolean;
  serverMessage?: string | null;
}

const REASON_KEYS = {
  operator_required: ["e2ee_blocked_operator_required", "e2ee_blocked_operator_required_group"],
  group_not_available: ["e2ee_blocked_operator_required", "e2ee_blocked_operator_required_group"],
  self_refuses: ["e2ee_blocked_self_refuses", "e2ee_blocked_self_refuses_group"],
  participant_refuses: [
    "e2ee_blocked_participant_refuses",
    "e2ee_blocked_participant_refuses_group",
  ],
  operator_disabled: ["e2ee_blocked_operator_disabled", "e2ee_blocked_operator_disabled"],
} as const;

function reasonKeys(reason: string | null) {
  return reason !== null && reason in REASON_KEYS
    ? REASON_KEYS[reason as keyof typeof REASON_KEYS]
    : undefined;
}

const NOT_READY_KEYS = {
  web: "e2ee_not_ready_web",
  not_restored: "e2ee_not_ready_restore",
  other_server: "e2ee_not_ready_other_server",
} as const;

export function CreationBlockedNotice({ outcome, names, group, serverMessage }: Props) {
  const { t } = useTranslation("conversation");
  let message: string;
  if (outcome.kind === "client_not_ready") {
    message = t(NOT_READY_KEYS[outcome.why]);
  } else {
    const keys = reasonKeys(outcome.reason);
    const people =
      outcome.reason === "participant_refuses" || outcome.reason === "operator_disabled"
        ? outcome.refusingUserIds
        : outcome.unreachableUserIds;
    message =
      keys === undefined
        ? (serverMessage ?? t("e2ee_blocked_generic"))
        : t(group ? keys[1] : keys[0], { names: names(people) });
  }
  return (
    <div
      data-testid="e2ee-creation-blocked"
      role="status"
      className="flex items-start gap-2 border-t border-line bg-canvas px-4 py-3"
    >
      <AlertTriangleIcon size={14} className="mt-0.5 shrink-0 text-warning" />
      <div className="space-y-0.5">
        {outcome.kind === "blocked" && (
          <p className="text-sm font-semibold text-fg">{t("e2ee_blocked_title")}</p>
        )}
        <p className="text-sm text-fg-muted">{message}</p>
      </div>
    </div>
  );
}
