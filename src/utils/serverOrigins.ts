export interface OriginHolder {
  origin: string;
  apiOrigin: string | null;
}

interface PickableConnection extends OriginHolder {
  identityId: string;
  kind: string;
  status: string;
}

export function connectionAnswersTo(holder: OriginHolder, origin: string): boolean {
  return holder.origin === origin || (holder.apiOrigin !== null && holder.apiOrigin === origin);
}

export function pickConnection<T extends PickableConnection>(
  items: readonly T[],
  origin: string,
  activeIdentityId: string | null,
): T | null {
  const onOrigin = items.filter((item) => connectionAnswersTo(item, origin));
  const healthy = onOrigin.filter((item) => item.status === "healthy");
  return (
    healthy.find((item) => item.identityId === activeIdentityId) ??
    healthy.find((item) => item.kind !== "guest") ??
    healthy[0] ??
    null
  );
}
