import type { useNavigate } from "@tanstack/react-router";
import { requestIdentitySwitch } from "@/platform/activeIdentity";
import { linkScope, type PermalinkTarget } from "@/utils/linkScope";

export function openLinkedMessage(
  target: PermalinkTarget,
  navigate: ReturnType<typeof useNavigate>,
): void {
  const route = { to: "/m/$messageId", params: { messageId: target.uuid } } as const;
  const scope = linkScope(target.origin);
  if (scope?.kind === "foreign") {
    void requestIdentitySwitch(scope.endpoint.identityId, route).catch(() => undefined);
    return;
  }
  void navigate(route);
}
