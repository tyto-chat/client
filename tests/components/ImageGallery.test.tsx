import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("falls back to the original when the thumbnail fails to load", () => {
    render(
      <ImageGallery
        images={[attachment(1, "https://core.test/thumb-1.jpg")]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://core.test/thumb-1.jpg");

    fireEvent.error(img);

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://core.test/media/token/original-1.jpg",
    );
  });

  it("keeps the original on a repeated error instead of looping", () => {
    render(
      <ImageGallery
        images={[attachment(1, null)]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
    );
    const img = screen.getByRole("img");
    fireEvent.error(img);
    fireEvent.error(img);
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://core.test/media/token/original-1.jpg",
    );
  });

  it("labels animated GIF tiles and still opens them in the lightbox", () => {
    const onOpen = vi.fn();
    const gif = {
      ...attachment(1, "https://core.test/thumb-1.gif"),
      mimeType: "image/gif",
      animated: true,
    };
    render(
      <ImageGallery
        images={[gif, attachment(2, "https://core.test/thumb-2.jpg")]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={onOpen}
      />,
    );
    expect(screen.getAllByText("GIF")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "photo-1.jpg" }));
    expect(onOpen).toHaveBeenCalledWith(gif);
  });

  it("labels a single animated GIF and leaves still images unlabelled", () => {
    const { rerender } = render(
      <ImageGallery
        images={[{ ...attachment(1, "https://core.test/thumb-1.gif"), animated: true }]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
    );
    expect(screen.getByText("GIF")).toBeInTheDocument();

    rerender(
      <ImageGallery
        images={[{ ...attachment(1, "https://core.test/thumb-1.gif"), animated: false }]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
    );
    expect(screen.queryByText("GIF")).not.toBeInTheDocument();
  });
});
