import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppMode, isManagedIdentityMode } from "@/platform/appMode";

describe("appMode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to web when unset", () => {
    vi.stubEnv("VITE_APP_MODE", "");
    expect(getAppMode()).toBe("web");
    expect(isManagedIdentityMode()).toBe(false);
  });

  it("returns desktop and flags managed mode", () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    expect(getAppMode()).toBe("desktop");
    expect(isManagedIdentityMode()).toBe(true);
  });

  it("falls back to web on unknown value", () => {
    vi.stubEnv("VITE_APP_MODE", "tv");
    expect(getAppMode()).toBe("web");
  });
});
