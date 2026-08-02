export function decodeJwtPayload<T>(token: string): T | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as T;
  } catch {
    return null;
  }
}
