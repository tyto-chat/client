import { describe, expect, it } from "vitest";
import { needsReconnect, tokenCovers } from "@/utils/mercureGrants";

function token(subscribe: unknown): string {
  const body = btoa(JSON.stringify({ mercure: { subscribe } }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `h.${body}.s`;
}

describe("tokenCovers", () => {
  it("matches exact topics and URI templates", () => {
    const t = token(["u/42/n", "u/{userId}/p", "c/12"]);
    expect(tokenCovers(t, ["u/42/n"])).toBe(true);
    expect(tokenCovers(t, ["u/7/p", "u/8/p"])).toBe(true);
    expect(tokenCovers(t, ["c/12"])).toBe(true);
    expect(tokenCovers(t, ["c/13"])).toBe(false);
    expect(tokenCovers(t, ["u/7/p/x"])).toBe(false);
  });

  it("treats a template only as a whole path segment", () => {
    expect(tokenCovers(token(["c.{id}"]), ["cX5"])).toBe(false);
    expect(tokenCovers(token(["u/{userId}/p"]), ["u//p"])).toBe(false);
    expect(tokenCovers(token(["u/{userId}/p"]), ["u/7/p"])).toBe(true);
  });

  it("returns null when the grants cannot be read", () => {
    expect(tokenCovers("not-a-jwt", ["c/12"])).toBeNull();
    expect(tokenCovers(token("c/12"), ["c/12"])).toBeNull();
  });
});

describe("needsReconnect", () => {
  const scopedA = token(["u/42/n", "u/{userId}/p", "k/5", "c/12"]);
  const scopedB = token(["u/42/n", "u/{userId}/p", "k/9", "c/30"]);

  it("keeps connections the old token already covered", () => {
    expect(needsReconnect(scopedA, scopedB, ["u/42/n"])).toBe(false);
    expect(needsReconnect(scopedA, scopedB, ["u/7/p"])).toBe(false);
  });

  it("reconnects when only the new token grants the topic", () => {
    expect(needsReconnect(scopedA, scopedB, ["c/30"])).toBe(true);
  });

  it("keeps the connection when neither token grants it", () => {
    expect(needsReconnect(scopedA, scopedB, ["c/99"])).toBe(false);
  });

  it("reconnects when the new token no longer grants a topic the old one did", () => {
    expect(needsReconnect(scopedA, scopedB, ["c/12"])).toBe(true);
  });

  it("reconnects when grants are unreadable", () => {
    expect(needsReconnect("opaque-1", "opaque-2", ["c/12"])).toBe(true);
  });

  it("never reconnects for the same token", () => {
    expect(needsReconnect(scopedA, scopedA, ["c/30"])).toBe(false);
  });
});
