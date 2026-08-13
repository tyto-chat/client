import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import {
  identityFetch,
  identityPost,
  IdentityFetchError,
  unwrapMember,
  type ServerContext,
} from "@/desktop/agents/identityFetch";

const ORIGIN_A = "https://alpha.example";
const ORIGIN_B = "https://beta.example";

function ctx(origin: string, token: string | null = "tok-live"): ServerContext {
  return { origin, apiVersion: "v1", getToken: () => token };
}

describe("identityFetch", () => {
  it("builds a versioned URL from ctx.origin and ctx.apiVersion", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${ORIGIN_A}/api/v1/whoami`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ id: 1 });
      }),
    );
    await identityFetch(ctx(ORIGIN_A), "/whoami");
    expect(capturedUrl).toBe(`${ORIGIN_A}/api/v1/whoami`);
  });

  it("resolves against each context's own origin, not a shared global one", async () => {
    server.use(
      http.get(`${ORIGIN_A}/api/v1/whoami`, () => HttpResponse.json({ origin: "a" })),
      http.get(`${ORIGIN_B}/api/v1/whoami`, () => HttpResponse.json({ origin: "b" })),
    );
    const [a, b] = await Promise.all([
      identityFetch(ctx(ORIGIN_A), "/whoami"),
      identityFetch(ctx(ORIGIN_B), "/whoami"),
    ]);
    expect(a).toEqual({ origin: "a" });
    expect(b).toEqual({ origin: "b" });
  });

  it("does not double-prefix a path that is already versioned", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${ORIGIN_A}/api/v1/messages`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ ok: true });
      }),
    );
    await identityFetch(ctx(ORIGIN_A), "/api/v1/messages");
    expect(capturedUrl).toBe(`${ORIGIN_A}/api/v1/messages`);
  });

  it("sends the Bearer token from ctx.getToken", async () => {
    let authHeader: string | null = null;
    server.use(
      http.get(`${ORIGIN_A}/api/v1/whoami`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({});
      }),
    );
    await identityFetch(ctx(ORIGIN_A, "secret-token"), "/whoami");
    expect(authHeader).toBe("Bearer secret-token");
  });

  it("omits the Authorization header when getToken returns null", async () => {
    let authHeader: string | null = "unset";
    server.use(
      http.get(`${ORIGIN_A}/api/v1/whoami`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({});
      }),
    );
    await identityFetch(ctx(ORIGIN_A, null), "/whoami");
    expect(authHeader).toBeNull();
  });

  it("sends Accept: application/ld+json and no cookie header", async () => {
    let acceptHeader: string | null = null;
    let cookieHeader: string | null = "unset";
    server.use(
      http.get(`${ORIGIN_A}/api/v1/whoami`, ({ request }) => {
        acceptHeader = request.headers.get("Accept");
        cookieHeader = request.headers.get("Cookie");
        return HttpResponse.json({});
      }),
    );
    await identityFetch(ctx(ORIGIN_A), "/whoami");
    expect(acceptHeader).toBe("application/ld+json");
    expect(cookieHeader).toBeNull();
  });

  it("issues the request with credentials omitted", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    server.use(http.get(`${ORIGIN_A}/api/v1/whoami`, () => HttpResponse.json({})));
    await identityFetch(ctx(ORIGIN_A), "/whoami");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "omit" }),
    );
    fetchSpy.mockRestore();
  });

  it("parses a JSON response body", async () => {
    server.use(
      http.get(`${ORIGIN_A}/api/v1/whoami`, () => HttpResponse.json({ id: 42, name: "Ada" })),
    );
    const result = await identityFetch<{ id: number; name: string }>(ctx(ORIGIN_A), "/whoami");
    expect(result).toEqual({ id: 42, name: "Ada" });
  });

  it("throws IdentityFetchError with the status and parsed body on a non-ok response", async () => {
    server.use(
      http.get(`${ORIGIN_A}/api/v1/whoami`, () =>
        HttpResponse.json({ error: "expired" }, { status: 401 }),
      ),
    );
    await expect(identityFetch(ctx(ORIGIN_A), "/whoami")).rejects.toMatchObject({
      status: 401,
      body: { error: "expired" },
    });
    await expect(identityFetch(ctx(ORIGIN_A), "/whoami")).rejects.toBeInstanceOf(
      IdentityFetchError,
    );
  });

  it("resolves body to null when a non-ok response has no JSON body", async () => {
    server.use(
      http.get(`${ORIGIN_A}/api/v1/whoami`, () => new HttpResponse(null, { status: 500 })),
    );
    await expect(identityFetch(ctx(ORIGIN_A), "/whoami")).rejects.toMatchObject({
      status: 500,
      body: null,
    });
  });

  it("does not retry on failure", async () => {
    let calls = 0;
    server.use(
      http.get(`${ORIGIN_A}/api/v1/whoami`, () => {
        calls += 1;
        return HttpResponse.json({ error: "nope" }, { status: 401 });
      }),
    );
    await expect(identityFetch(ctx(ORIGIN_A), "/whoami")).rejects.toBeInstanceOf(
      IdentityFetchError,
    );
    expect(calls).toBe(1);
  });
});

describe("identityPost", () => {
  it("sends a JSON-encoded body with a matching content type", async () => {
    let receivedBody: unknown;
    let contentType: string | null = null;
    server.use(
      http.post(`${ORIGIN_A}/api/v1/agents/ping`, async ({ request }) => {
        contentType = request.headers.get("Content-Type");
        receivedBody = await request.json();
        return HttpResponse.json({ ack: true });
      }),
    );
    const result = await identityPost(ctx(ORIGIN_A), "/agents/ping", { note: "hi" });
    expect(contentType).toContain("application/json");
    expect(receivedBody).toEqual({ note: "hi" });
    expect(result).toEqual({ ack: true });
  });

  it("sends no body when none is provided", async () => {
    let receivedText = "unset";
    server.use(
      http.post(`${ORIGIN_A}/api/v1/agents/ping`, async ({ request }) => {
        receivedText = await request.text();
        return HttpResponse.json({ ack: true });
      }),
    );
    await identityPost(ctx(ORIGIN_A), "/agents/ping");
    expect(receivedText).toBe("");
  });

  it("still sends the Bearer token on a post", async () => {
    let authHeader: string | null = null;
    server.use(
      http.post(`${ORIGIN_A}/api/v1/agents/ping`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({});
      }),
    );
    await identityPost(ctx(ORIGIN_A, "post-token"), "/agents/ping", {});
    expect(authHeader).toBe("Bearer post-token");
  });
});

describe("unwrapMember", () => {
  it("returns the array unchanged when payload is already an array", () => {
    const items = [{ id: 1 }, { id: 2 }];
    expect(unwrapMember(items)).toBe(items);
  });

  it("extracts hydra:member from a hydra collection payload", () => {
    const payload = {
      "@context": "/api/contexts/Item",
      "@id": "/api/v1/items",
      "@type": "hydra:Collection",
      "hydra:member": [{ id: 1 }, { id: 2 }],
      "hydra:totalItems": 2,
    };
    expect(unwrapMember(payload)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("falls back to an empty array when hydra:member is missing", () => {
    expect(unwrapMember({})).toEqual([]);
  });
});
