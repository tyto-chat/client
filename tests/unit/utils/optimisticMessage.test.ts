import { describe, expect, it } from "vitest";
import { isOptimisticMessage } from "@/utils/optimisticMessage";

describe("isOptimisticMessage", () => {
  it("recognises the optimistic placeholder id", () => {
    expect(isOptimisticMessage("optimistic-1755630000000-1")).toBe(true);
  });

  it("rejects real message iris and empty values", () => {
    expect(isOptimisticMessage("/api/messages/2f1c6a3e-1111-4222-8333-444455556666")).toBe(false);
    expect(isOptimisticMessage("")).toBe(false);
    expect(isOptimisticMessage(undefined)).toBe(false);
    expect(isOptimisticMessage(null)).toBe(false);
  });
});
