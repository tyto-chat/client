import { describe, expect, it } from "vitest";
import { shouldDeferCameraForBlur } from "@/utils/cameraJoin";

describe("shouldDeferCameraForBlur", () => {
  it("defers the camera publish when joining with camera and blur is on", () => {
    expect(shouldDeferCameraForBlur(true, "light", true)).toBe(true);
    expect(shouldDeferCameraForBlur(true, "strong", true)).toBe(true);
  });

  it("does not defer when blur is off", () => {
    expect(shouldDeferCameraForBlur(true, "off", true)).toBe(false);
  });

  it("does not defer when processors are unsupported", () => {
    expect(shouldDeferCameraForBlur(true, "strong", false)).toBe(false);
  });

  it("does not defer when not joining with the camera", () => {
    expect(shouldDeferCameraForBlur(false, "strong", true)).toBe(false);
  });
});
