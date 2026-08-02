const keyMap = new Map<string, string>();

export function inheritMessageKey(fromId: string, toId: string): void {
  if (fromId === toId) return;
  const k = keyMap.get(fromId) ?? fromId;
  keyMap.set(toId, k);
}

export function stableMessageKey(messageId: string): string {
  return keyMap.get(messageId) ?? messageId;
}
