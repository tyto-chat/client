import { describe, it, expect } from "vitest";
import { inheritMessageKey, stableMessageKey } from "@/utils/messageKey";

describe("messageKey", () => {
  it("returns the id itself when no inheritance has been recorded", () => {
    expect(stableMessageKey("plain-id")).toBe("plain-id");
  });

  it("inheritMessageKey makes the real id resolve to the optimistic id", () => {
    const fromId = "optimistic-12345";
    const toId = "/api/messages/uuid-1";
    inheritMessageKey(fromId, toId);
    expect(stableMessageKey(toId)).toBe(fromId);
  });

  it("treats a versioned /api/v1/... real id as an opaque string key, same as unversioned", () => {
    const fromId = "optimistic-67890";
    const toId = "/api/v1/messages/uuid-2";
    inheritMessageKey(fromId, toId);
    expect(stableMessageKey(toId)).toBe(fromId);
  });

  it("is a no-op when fromId === toId", () => {
    inheritMessageKey("same", "same");
    expect(stableMessageKey("same")).toBe("same");
  });

  it("chains transitively when an already-inherited key is used as fromId", () => {
    inheritMessageKey("opt-A", "real-A");
    inheritMessageKey("real-A", "real-A-renamed");
    expect(stableMessageKey("real-A-renamed")).toBe("opt-A");
  });
});
