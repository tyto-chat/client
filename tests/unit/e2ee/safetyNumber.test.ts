import { describe, expect, it } from "vitest";
import { safetyNumber } from "@/e2ee/safetyNumber";

const keyA = new Uint8Array(32).fill(1);
const keyB = new Uint8Array(32).fill(2);
const keyC = new Uint8Array(32).fill(3);

describe("safetyNumber", () => {
  it("safety_number_identical_both_sides_and_changes_with_key", async () => {
    const fromA = await safetyNumber(keyA, keyB);
    const fromB = await safetyNumber(keyB, keyA);

    expect(fromA).toBe(fromB);
    expect(fromA).toMatch(/^\d{5}( \d{5}){11}$/);
    await expect(safetyNumber(keyA, keyC)).resolves.not.toBe(fromA);
  });

  it("is stable across releases", async () => {
    await expect(safetyNumber(keyA, keyB)).resolves.toBe(await safetyNumber(keyA, keyB));
    expect(await safetyNumber(keyA, keyB)).toMatchInlineSnapshot(
      `"58863 90845 14358 57537 52451 42795 57682 42422 57367 28061 52564 86683"`,
    );
  });
});
