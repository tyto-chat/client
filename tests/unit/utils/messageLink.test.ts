import { describe, it, expect, vi } from "vitest";
import { messageLinkFromIri, copyMessageLinkToClipboard } from "@/utils/messageLink";

describe("messageLinkFromIri", () => {
  it("builds an absolute /m/<uuid> URL from a Message IRI", () => {
    expect(messageLinkFromIri("/api/messages/abc-uuid-123", "https://chat.example.com")).toBe(
      "https://chat.example.com/m/abc-uuid-123",
    );
  });

  it("handles a trailing slash on the IRI", () => {
    expect(messageLinkFromIri("/api/messages/abc-uuid-123/", "https://chat.example.com")).toBe(
      "https://chat.example.com/m/abc-uuid-123",
    );
  });

  it("tolerates a versioned /api/v1/... IRI (uuidFromIri keeps the last path segment)", () => {
    expect(messageLinkFromIri("/api/v1/messages/abc-uuid-123", "https://chat.example.com")).toBe(
      "https://chat.example.com/m/abc-uuid-123",
    );
  });
});

describe("copyMessageLinkToClipboard", () => {
  it("writes the permalink to navigator.clipboard and returns true on success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const ok = await copyMessageLinkToClipboard("/api/messages/xyz", "https://chat.example.com");

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://chat.example.com/m/xyz");
  });

  it("returns false when the clipboard write fails (e.g. permission denied)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const ok = await copyMessageLinkToClipboard("/api/messages/xyz", "https://chat.example.com");

    expect(ok).toBe(false);
  });
});
