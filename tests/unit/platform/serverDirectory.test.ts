import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getServerDirectory,
  registerServerDirectory,
  type ServerDirectorySource,
  type ServerEndpoint,
} from "@/platform/serverDirectory";

function endpoint(overrides: Partial<ServerEndpoint> & { identityId: string }): ServerEndpoint {
  return {
    origin: "https://a.example",
    apiOrigin: null,
    serverName: "A",
    kind: "identity",
    status: "healthy",
    communities: [],
    ctx: { origin: "https://a.example", apiVersion: "v1", getToken: () => "t" },
    ...overrides,
  };
}

function makeSource(endpoints: ServerEndpoint[], active: string | null = null) {
  const listeners = new Set<() => void>();
  const state = { endpoints, active };
  const source: ServerDirectorySource = {
    list: () => state.endpoints,
    activeIdentityId: () => state.active,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { source, state, notify: () => listeners.forEach((l) => l()), listeners };
}

afterEach(() => registerServerDirectory(null));

describe("serverDirectory", () => {
  it("is empty when no source is registered", () => {
    const directory = getServerDirectory();
    expect(directory.origins()).toEqual([]);
    expect(directory.find("https://a.example")).toBeNull();
    expect(directory.activeIdentityId()).toBeNull();
  });

  it("finds an endpoint with the pickConnection rules", () => {
    const { source } = makeSource(
      [
        endpoint({ identityId: "g", kind: "guest" }),
        endpoint({ identityId: "x", status: "unreachable" }),
        endpoint({ identityId: "a" }),
      ],
      "other",
    );
    registerServerDirectory(source);
    expect(getServerDirectory().find("https://a.example")?.identityId).toBe("a");
  });

  it("finds by the api origin as well", () => {
    const { source } = makeSource([
      endpoint({ identityId: "a", apiOrigin: "https://api.a.example" }),
    ]);
    registerServerDirectory(source);
    expect(getServerDirectory().find("https://api.a.example")?.identityId).toBe("a");
  });

  it("lists both origins of every endpoint once", () => {
    const { source } = makeSource([
      endpoint({ identityId: "a", apiOrigin: "https://api.a.example" }),
      endpoint({ identityId: "b", apiOrigin: "https://api.a.example" }),
      endpoint({ identityId: "c", origin: "https://c.example", apiOrigin: null }),
    ]);
    registerServerDirectory(source);
    expect(getServerDirectory().origins().sort()).toEqual([
      "https://a.example",
      "https://api.a.example",
      "https://c.example",
    ]);
  });

  it("returns the same snapshot object until the source notifies", () => {
    const { source, state, notify } = makeSource([endpoint({ identityId: "a" })]);
    registerServerDirectory(source);
    const first = getServerDirectory();
    expect(getServerDirectory()).toBe(first);
    state.endpoints = [
      endpoint({ identityId: "a" }),
      endpoint({ identityId: "b", origin: "https://b.example" }),
    ];
    notify();
    const second = getServerDirectory();
    expect(second).not.toBe(first);
    expect(second.version).toBeGreaterThan(first.version);
    expect(second.origins()).toContain("https://b.example");
  });

  it("ignores notifications that change nothing a consumer can see", async () => {
    const { source, notify } = makeSource([endpoint({ identityId: "a" })]);
    registerServerDirectory(source);
    const { renderHook, act } = await import("@testing-library/react");
    const { useServerDirectory } = await import("@/platform/serverDirectory");
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useServerDirectory();
    });
    const before = result.current;
    const rendersBefore = renders;
    act(() => notify());
    act(() => notify());
    expect(result.current).toBe(before);
    expect(renders).toBe(rendersBefore);
  });

  it("rebuilds when a status, a server name or the active identity changes", () => {
    const { source, state, notify } = makeSource([endpoint({ identityId: "a" })], "a");
    registerServerDirectory(source);
    const first = getServerDirectory();
    state.endpoints = [endpoint({ identityId: "a", status: "unreachable" })];
    notify();
    const second = getServerDirectory();
    expect(second).not.toBe(first);
    state.endpoints = [endpoint({ identityId: "a", status: "unreachable", serverName: "Renamed" })];
    notify();
    const third = getServerDirectory();
    expect(third).not.toBe(second);
    state.active = "b";
    notify();
    expect(getServerDirectory()).not.toBe(third);
  });

  it("clears and stops listening when unregistered", () => {
    const { source, listeners } = makeSource([endpoint({ identityId: "a" })]);
    registerServerDirectory(source);
    registerServerDirectory(null);
    expect(listeners.size).toBe(0);
    expect(getServerDirectory().origins()).toEqual([]);
  });

  it("notifies hook subscribers when the source changes", async () => {
    const { source, state, notify } = makeSource([endpoint({ identityId: "a" })]);
    registerServerDirectory(source);
    const { renderHook, act } = await import("@testing-library/react");
    const { useServerDirectory } = await import("@/platform/serverDirectory");
    const spy = vi.fn();
    const { result } = renderHook(() => {
      const directory = useServerDirectory();
      spy(directory.version);
      return directory;
    });
    const before = result.current.version;
    state.endpoints = [endpoint({ identityId: "a", status: "unreachable" })];
    act(() => notify());
    expect(result.current.version).toBeGreaterThan(before);
  });
});
