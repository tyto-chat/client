export interface E2eeEvent {
  type?: string;
  conversationIdentifier?: string;
}

const listeners = new Set<(event: E2eeEvent) => void>();

export function isE2eeEvent(data: { type?: unknown } | null | undefined): boolean {
  return typeof data?.type === "string" && data.type.startsWith("mls.");
}

export function dispatchE2eeEvent(event: E2eeEvent): void {
  for (const listener of listeners) listener(event);
}

export function onE2eeEvent(listener: (event: E2eeEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
