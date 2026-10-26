import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ImageGallery } from "@/components/chat/attachments/ImageGallery";
import { previewUrl } from "@/utils/attachmentFormat";
import { fitWithin, stillFrameSize } from "@/utils/gif";
import { queryKeys } from "@/queries/queryKeys";
import type { Attachment } from "@/types/api";

function prefsWrapper(autoplayGifs: boolean | null) {
  const client = new QueryClient();
  client.setQueryData(queryKeys.userPreferences(), {
    autoplayGifs,
    updatedAt: "2026-10-26T00:00:00Z",
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

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

  it("plays a GIF tile in place on click and opens the lightbox only from the full-size button", () => {
    const onOpen = vi.fn();
    const gif = {
      ...attachment(1, "https://core.test/thumb-1.gif"),
      contentUrl: "https://core.test/media/token/original-1.gif",
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
      { wrapper: prefsWrapper(null) },
    );
    expect(screen.getAllByText("GIF")).toHaveLength(1);
    expect(screen.getByText("GIF")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "photo-2.jpg" })).toBeInTheDocument();
    expect(screen.queryByTestId("gif-playing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Play GIF photo-1.jpg" }));
    expect(screen.getByTestId("gif-playing")).toHaveAttribute(
      "src",
      "https://core.test/media/token/original-1.gif",
    );
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Pause GIF photo-1.jpg" }));
    expect(screen.queryByTestId("gif-playing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View full size" }));
    expect(onOpen).toHaveBeenCalledWith(gif);
  });

  it("starts GIFs playing when auto-play is on", () => {
    render(
      <ImageGallery
        images={[{ ...attachment(1, "https://core.test/thumb-1.gif"), animated: true }]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
      { wrapper: prefsWrapper(true) },
    );
    expect(screen.getByRole("button", { name: "Pause GIF photo-1.jpg" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("gif-playing")).toHaveAttribute("loading", "lazy");
  });

  it("sizes a single GIF to fit and keeps still images unlabelled", () => {
    const { rerender } = render(
      <ImageGallery
        images={[{ ...attachment(1, "https://core.test/thumb-1.gif"), animated: true }]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
      { wrapper: prefsWrapper(null) },
    );
    expect(screen.getByText("GIF")).toBeInTheDocument();
    expect(document.querySelector("img")).toHaveStyle({ width: "320px" });

    rerender(
      <ImageGallery
        images={[{ ...attachment(1, "https://core.test/thumb-1.gif"), animated: false }]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
    );
    expect(screen.queryByText("GIF")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View full size" })).not.toBeInTheDocument();
  });
});

describe("ImageGallery GIF still frame", () => {
  const noop = vi.fn();
  const gif = (thumbnailUrl: string | null) => ({
    ...attachment(1, thumbnailUrl),
    contentUrl: "https://core.test/media/token/original-1.gif",
    animated: true,
  });

  it("never shows the animated original while paused when there is no thumbnail", () => {
    render(
      <ImageGallery
        images={[gif(null)]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
      { wrapper: prefsWrapper(null) },
    );
    const img = document.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://core.test/media/token/original-1.gif");
    expect(img.className).toContain("opacity-0");
    expect(screen.getByTestId("gif-still")).toBeInTheDocument();
  });

  it("switches to the drawn still frame when the thumbnail fails", () => {
    render(
      <ImageGallery
        images={[gif("https://core.test/thumb-1.png")]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
      { wrapper: prefsWrapper(null) },
    );
    fireEvent.error(document.querySelector("img")!);
    const img = document.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://core.test/media/token/original-1.gif");
    expect(img.className).toContain("opacity-0");
  });

  it("hides the still thumbnail once the playing original has loaded", () => {
    render(
      <ImageGallery
        images={[gif("https://core.test/thumb-1.png")]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
      { wrapper: prefsWrapper(null) },
    );
    const thumb = document.querySelector("img")!;
    fireEvent.click(screen.getByRole("button", { name: "Play GIF photo-1.jpg" }));
    expect(thumb.className).not.toContain("invisible");
    fireEvent.load(screen.getByTestId("gif-playing"));
    expect(thumb.className).toContain("invisible");

    fireEvent.click(screen.getByRole("button", { name: "Pause GIF photo-1.jpg" }));
    expect(thumb.className).not.toContain("invisible");
  });

  it("keeps the full-size button visible on devices without hover", () => {
    render(
      <ImageGallery
        images={[gif("https://core.test/thumb-1.png")]}
        canDelete={false}
        onDeleteAttachment={noop}
        onOpen={noop}
      />,
      { wrapper: prefsWrapper(null) },
    );
    expect(screen.getByRole("button", { name: "View full size" }).className).toContain(
      "[@media(hover:none)]:block",
    );
  });
});

describe("fitWithin", () => {
  it("keeps small GIFs at their own size and scales big ones down", () => {
    expect(fitWithin(200, 150, 320, 192)).toEqual({ width: 200, height: 150 });
    expect(fitWithin(3840, 2160, 320, 192)).toEqual({ width: 320, height: 180 });
    expect(fitWithin(400, 800, 320, 192)).toEqual({ width: 96, height: 192 });
  });
});

describe("stillFrameSize", () => {
  it("draws the still at the shown size times the screen density, never above the original", () => {
    expect(stillFrameSize(4000, 4000, 192, 192, 2)).toEqual({ width: 384, height: 384 });
    expect(stillFrameSize(434, 250, 320, 184, 2)).toEqual({ width: 434, height: 250 });
    expect(stillFrameSize(4000, 2000, 150, 150, 1)).toEqual({ width: 300, height: 150 });
  });

  it("caps an image that has no layout yet", () => {
    expect(stillFrameSize(4000, 2000, 0, 0, 1)).toEqual({ width: 640, height: 320 });
  });
});
