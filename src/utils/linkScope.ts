import {
  getServerDirectory,
  type ServerDirectorySnapshot,
  type ServerEndpoint,
} from "@/platform/serverDirectory";
import { permalinkOrigins } from "@/utils/permalinkOrigins";

export interface PermalinkTarget {
  origin: string;
  uuid: string;
}

export type LinkScope = { kind: "current" } | { kind: "foreign"; endpoint: ServerEndpoint };

export function linkScope(
  origin: string,
  directory: ServerDirectorySnapshot = getServerDirectory(),
): LinkScope | null {
  if (permalinkOrigins().includes(origin)) return { kind: "current" };
  const endpoint = directory.find(origin);
  if (!endpoint) return null;
  return endpoint.identityId === directory.activeIdentityId()
    ? { kind: "current" }
    : { kind: "foreign", endpoint };
}

export function linkViewer(scope: LinkScope | null): string {
  return scope?.kind === "foreign" ? scope.endpoint.identityId : "current";
}
