import { describe, expect, it } from "vitest";
import { connectionAnswersTo, pickConnection } from "@/utils/serverOrigins";

const holder = { origin: "https://added.example.com", apiOrigin: "https://api.added.example.com" };

describe("connectionAnswersTo", () => {
  it("answers to the typed origin and the api origin", () => {
    expect(connectionAnswersTo(holder, "https://added.example.com")).toBe(true);
    expect(connectionAnswersTo(holder, "https://api.added.example.com")).toBe(true);
  });

  it("does not answer to the api origin when none is known", () => {
    expect(
      connectionAnswersTo({ ...holder, apiOrigin: null }, "https://api.added.example.com"),
    ).toBe(false);
  });

  it.each([
    "https://added.example.com.evil.com",
    "https://added.example.com:8443",
    "http://added.example.com",
    "https://evil.com",
    "https://notadded.example.com",
  ])("rejects the lookalike %s", (lookalike) => {
    expect(connectionAnswersTo(holder, new URL(lookalike).origin)).toBe(false);
  });

  it("rejects a userinfo trick once parsed to its real origin", () => {
    expect(
      connectionAnswersTo(holder, new URL("https://added.example.com@evil.com/m/x").origin),
    ).toBe(false);
  });
});

describe("pickConnection", () => {
  const base = { origin: "https://s.example", apiOrigin: null as string | null };
  const make = (identityId: string, kind: string, status: string) => ({
    ...base,
    identityId,
    kind,
    status,
  });

  it("prefers the active identity", () => {
    const items = [make("a", "identity", "healthy"), make("b", "identity", "healthy")];
    expect(pickConnection(items, "https://s.example", "b")?.identityId).toBe("b");
  });

  it("falls back to the first healthy non-guest", () => {
    const items = [
      make("g", "guest", "healthy"),
      make("x", "identity", "auth_failed"),
      make("a", "identity", "healthy"),
    ];
    expect(pickConnection(items, "https://s.example", "other")?.identityId).toBe("a");
  });

  it("falls back to a healthy guest", () => {
    const items = [make("x", "identity", "unreachable"), make("g", "guest", "healthy")];
    expect(pickConnection(items, "https://s.example", null)?.identityId).toBe("g");
  });

  it("never picks an unhealthy connection", () => {
    const items = [make("x", "identity", "unreachable"), make("y", "guest", "connecting")];
    expect(pickConnection(items, "https://s.example", "x")).toBeNull();
  });

  it("returns null for an unknown origin", () => {
    expect(
      pickConnection([make("a", "identity", "healthy")], "https://other.example", "a"),
    ).toBeNull();
  });
});
