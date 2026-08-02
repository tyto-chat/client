import { describe, it, expect } from "vitest";
import { avatarUrl, logoUrl } from "@/api/client";
import type { AvatarMediaObject, LogoMediaObject } from "@/types/api";

describe("avatarUrl", () => {
  const contentUrl: NonNullable<AvatarMediaObject["contentUrl"]> = {
    sm: "https://example.com/avatars/sm/photo.jpg",
    md: "https://example.com/avatars/md/photo.jpg",
    lg: "https://example.com/avatars/lg/photo.jpg",
  };

  it("returns null when contentUrl is null", () => {
    expect(avatarUrl(null)).toBeNull();
  });

  it("returns the sm URL by default", () => {
    expect(avatarUrl(contentUrl)).toBe(contentUrl.sm);
  });

  it("returns the md URL when size is 'md'", () => {
    expect(avatarUrl(contentUrl, "md")).toBe(contentUrl.md);
  });

  it("returns the lg URL when size is 'lg'", () => {
    expect(avatarUrl(contentUrl, "lg")).toBe(contentUrl.lg);
  });

  it("returns the sm URL when size is explicitly 'sm'", () => {
    expect(avatarUrl(contentUrl, "sm")).toBe(contentUrl.sm);
  });

  it("each size resolves to a distinct URL", () => {
    const urls = [
      avatarUrl(contentUrl, "sm"),
      avatarUrl(contentUrl, "md"),
      avatarUrl(contentUrl, "lg"),
    ];
    expect(new Set(urls).size).toBe(3);
  });
});

describe("logoUrl", () => {
  const contentUrl: NonNullable<LogoMediaObject["contentUrl"]> = {
    sm: "https://example.com/logos/sm/logo.jpg",
    md: "https://example.com/logos/md/logo.jpg",
    lg: "https://example.com/logos/lg/logo.jpg",
  };

  it("returns null when contentUrl is null", () => {
    expect(logoUrl(null)).toBeNull();
  });

  it("returns the sm URL", () => {
    expect(logoUrl(contentUrl)).toBe(contentUrl.sm);
  });
});
