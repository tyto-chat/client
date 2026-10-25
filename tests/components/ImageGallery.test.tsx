import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImageGallery } from "@/components/chat/attachments/ImageGallery";
import { previewUrl } from "@/utils/attachmentFormat";
import type { Attachment } from "@/types/api";

function attachment(id: number, thumbnailUrl?: string | null): Attachment {
  return {
    "@id": `/api/v1/media_objects/${id}`,
    "@type": "MediaObject",
    contentUrl: `https://core.test/media/token/original-${id}.jpg`,
    thumbnailUrl,
    originalName: `photo-${id}.jpg`,
    mimeType: "image/jpeg",
    size: 4_000_000,
    width: 3840,
    height: 2160,
  };
}

describe("previewUrl", () => {
  it("prefers the thumbnail", () => {
    expect(previewUrl(attachment(1, "https://core.test/thumb-1.jpg"))).toBe(
      "https://core.test/thumb-1.jpg",
    );
  });

  it("falls back to the original when there is no thumbnail", () => {
    expect(previewUrl(attachment(1, null))).toBe("https://core.test/media/token/original-1.jpg");
    expect(previewUrl(attachment(1))).toBe("https://core.test/media/token/original-1.jpg");
  });
});

describe("ImageGallery", () => {
  const noop = vi.fn();

  it("renders the thumbnail for a single image", () => {
    render(
      <ImageGallery
        images={[attachment(1, "https://core.test/thumb-1.jpg")]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://core.test/thumb-1.jpg");
  });

  it("renders thumbnails in a multi-image grid and falls back per tile", () => {
    render(
      <ImageGallery
        images={[attachment(1, "https://core.test/thumb-1.jpg"), attachment(2, null)]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
    );
    const srcs = screen.getAllByRole("img").map((img) => img.getAttribute("src"));
    expect(srcs).toEqual([
      "https://core.test/thumb-1.jpg",
      "https://core.test/media/token/original-2.jpg",
    ]);
  });
});
