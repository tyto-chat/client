import { registerServerDirectory, type ServerEndpoint } from "@/platform/serverDirectory";

export function fakeEndpoint(
  identityId: string,
  origin: string,
  overrides: Partial<ServerEndpoint> = {},
): ServerEndpoint {
  return {
    identityId,
    origin,
    apiOrigin: null,
    serverName: null,
    kind: "identity",
    status: "healthy",
    communities: [],
    ctx: { origin, apiVersion: "v1", getToken: () => `token-${identityId}` },
    ...overrides,
  };
}

export function registerFakeDirectory(
  endpoints: ServerEndpoint[],
  activeIdentityId: string | null = null,
): void {
  registerServerDirectory({
    list: () => endpoints,
    activeIdentityId: () => activeIdentityId,
    subscribe: () => () => {},
  });
}

export function clearFakeDirectory(): void {
  registerServerDirectory(null);
}
