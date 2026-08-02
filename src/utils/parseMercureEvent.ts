export function parseMercureEvent<T>(event: MessageEvent): T | null {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}
