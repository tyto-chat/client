import { getBaseUrl } from "@/api/client";

export function serverOrigin(): string {
  try {
    return new URL(getBaseUrl(), window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

export function permalinkOrigins(): string[] {
  return [...new Set([serverOrigin(), window.location.origin])];
}
