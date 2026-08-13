import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import {
  negotiateApiVersion,
  getApiVersion,
  getApiVersionForOrigin,
  supportsFeature,
  _resetNegotiationForTests,
} from "@/api/apiVersion";
import { versionedPath } from "@/api/client";

const ORIGIN = "https://core.example";

beforeEach(() => _resetNegotiationForTests());

describe("negotiateApiVersion", () => {
  it("picks the highest common version and records features", async () => {
    server.use(
      http.get(`${ORIGIN}/api/versions`, () =>
        HttpResponse.json({ versions: ["v1"], features: { voice: ["v1"] } }),
      ),
    );
    const result = await negotiateApiVersion(ORIGIN);
    expect(result).toEqual({ ok: true, version: "v1", features: { voice: ["v1"] } });
    expect(getApiVersion()).toBe("v1");
    expect(supportsFeature("voice")).toBe(true);
    expect(supportsFeature("holograms")).toBe(false);
  });

  it("reports server-newer when the server only speaks higher versions", async () => {
    server.use(
      http.get(`${ORIGIN}/api/versions`, () =>
        HttpResponse.json({ versions: ["v2", "v3"], features: {} }),
      ),
    );
    expect(await negotiateApiVersion(ORIGIN)).toEqual({ ok: false, direction: "server-newer" });
  });

  it("reports server-older when the server only speaks lower versions", async () => {
    server.use(
      http.get(`${ORIGIN}/api/versions`, () =>
        HttpResponse.json({ versions: ["v0"], features: {} }),
      ),
    );
    expect(await negotiateApiVersion(ORIGIN)).toEqual({ ok: false, direction: "server-older" });
  });

  it("throws on network failure instead of reporting a mismatch", async () => {
    server.use(http.get(`${ORIGIN}/api/versions`, () => HttpResponse.error()));
    await expect(negotiateApiVersion(ORIGIN)).rejects.toThrow();
  });

  it("throws on an empty versions array instead of reporting a mismatch", async () => {
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: [], features: {} })),
    );
    await expect(negotiateApiVersion(ORIGIN)).rejects.toThrow("malformed versions payload");
  });

  it("throws on non-conforming version entries instead of reporting a mismatch", async () => {
    server.use(
      http.get(`${ORIGIN}/api/versions`, () =>
        HttpResponse.json({ versions: ["banana"], features: {} }),
      ),
    );
    await expect(negotiateApiVersion(ORIGIN)).rejects.toThrow("malformed versions payload");
  });
});

describe("getApiVersionForOrigin", () => {
  it("keeps each origin's own negotiated version even after another origin negotiates", async () => {
    const OTHER_ORIGIN = "https://other.example";
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${OTHER_ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    );
    await negotiateApiVersion(ORIGIN);
    await negotiateApiVersion(OTHER_ORIGIN);
    expect(getApiVersion()).toBe("v1");
    expect(getApiVersionForOrigin(ORIGIN)).toBe("v1");
    expect(getApiVersionForOrigin(OTHER_ORIGIN)).toBe("v1");
  });

  it("falls back to the highest supported version for an un-negotiated origin", () => {
    expect(getApiVersionForOrigin("https://never-negotiated.example")).toBe("v1");
  });
});

describe("versionedPath", () => {
  it("injects the active version into bare /api/ paths", () => {
    expect(versionedPath("/api/communities/foo")).toBe("/api/v1/communities/foo");
  });
  it("leaves already-versioned paths untouched", () => {
    expect(versionedPath("/api/v1/messages/x")).toBe("/api/v1/messages/x");
  });
  it("leaves unversioned surfaces untouched", () => {
    expect(versionedPath("/api/versions")).toBe("/api/versions");
    expect(versionedPath("/api/health")).toBe("/api/health");
  });
});
