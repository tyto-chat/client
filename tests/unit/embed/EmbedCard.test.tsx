import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { configureEmbedApiBase } from "@/embed/api";
import { EmbedCard } from "@/embed/EmbedCard";
import { getUserTextColor } from "@/utils/userColor";

const UUID = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";

const message = {
  "@id": `/api/messages/${UUID}`,
  "@type": "Message",
  id: UUID,
  text: "<p>Hello <strong>world</strong></p>",
  isDeleted: false,
  edited: false,
  kind: "standard",
  createdAt: "2026-05-19T10:00:00Z",
  createdBy: mockUser,
  reactions: {
    "👍": [
      { id: 1, userId: 1 },
      { id: 2, userId: 2 },
    ],
  },
  pageNumber: 3,
  communityIdentifier: "demo",
  channelIdentifier: "general",
  replyCount: 3,
};

const community = {
  "@id": "/api/communities/demo",
  "@type": "Community",
  id: 1,
  identifier: "demo",
  name: "Demo Community",
  hostname: "demo.tyto.chat",
  description: "",
  isPrivate: false,
  broadcastMentionMinRole: "member",
  locale: "en",
  logo: null,
  channels: [],
  channelSections: [],
  accentColor: null,
};

const emptyEmojis = {
  "@context": "/api/contexts/CommunityEmoji",
  "@id": "/api/communities/demo/emojis",
  "@type": "Collection",
  "hydra:member": [],
  "hydra:totalItems": 0,
};

function mockAllEndpoints() {
  server.use(
    http.get(`${BASE}/api/v1/messages/${UUID}`, () => HttpResponse.json(message)),
    http.get(`${BASE}/api/v1/communities/demo`, () => HttpResponse.json(community)),
    http.get(`${BASE}/api/v1/communities/demo/emojis`, () => HttpResponse.json(emptyEmojis)),
  );
}

beforeEach(() => {
  configureEmbedApiBase(BASE);
});

describe("EmbedCard", () => {
  it("renders author, message html, community/channel label, reply count and a reaction pill after successful fetches", async () => {
    mockAllEndpoints();
    render(<EmbedCard uuid={UUID} />);

    await waitFor(() => expect(screen.getByText("Test User")).toBeInTheDocument());
    expect(screen.getByText("world").tagName).toBe("STRONG");
    expect(screen.getByText(/#general/)).toBeInTheDocument();
    expect(screen.getByText(/Demo Community/)).toBeInTheDocument();
    expect(screen.getByText(/3 replies/i)).toBeInTheDocument();
    expect(screen.getByText("👍")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the same neutral unavailable string on 403 as on 404", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${UUID}`, () => new HttpResponse(null, { status: 403 })),
    );
    const { unmount } = render(<EmbedCard uuid={UUID} />);
    await waitFor(() => expect(screen.getByText("Message unavailable")).toBeInTheDocument());
    unmount();

    server.use(
      http.get(`${BASE}/api/v1/messages/${UUID}`, () => new HttpResponse(null, { status: 404 })),
    );
    render(<EmbedCard uuid={UUID} />);
    await waitFor(() => expect(screen.getByText("Message unavailable")).toBeInTheDocument());
  });

  it("links the whole card to the client permalink with target=_blank", async () => {
    mockAllEndpoints();
    render(<EmbedCard uuid={UUID} />);
    await waitFor(() => expect(screen.getByText("Test User")).toBeInTheDocument());

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `${window.location.origin}/m/${UUID}`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("replaces shortcodes only in text nodes, never inside attribute values", async () => {
    const emojiCollection = {
      ...emptyEmojis,
      "hydra:member": [
        {
          "@id": "/api/community_emojis/1",
          "@type": "CommunityEmoji",
          id: 1,
          shortcode: ":wave:",
          name: "Wave",
          image: {
            "@id": "/api/media_objects/1",
            "@type": "MediaObject",
            contentUrl: "https://cdn.example/wave.gif",
            mimeType: "image/gif",
            width: 32,
            height: 32,
          },
          position: 0,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
      "hydra:totalItems": 1,
    };
    server.use(
      http.get(`${BASE}/api/v1/messages/${UUID}`, () =>
        HttpResponse.json({
          ...message,
          text: '<p><span title="hi:wave:bye" class="mention-user">x</span> :wave:</p>',
        }),
      ),
      http.get(`${BASE}/api/v1/communities/demo`, () => HttpResponse.json(community)),
      http.get(`${BASE}/api/v1/communities/demo/emojis`, () => HttpResponse.json(emojiCollection)),
    );

    const { container } = render(<EmbedCard uuid={UUID} />);
    await waitFor(() => expect(screen.getByText("Test User")).toBeInTheDocument());

    const span = container.querySelector("span.mention-user");
    expect(span).not.toBeNull();
    expect(span).toHaveAttribute("title", "hi:wave:bye");
    expect(span!.querySelector("img")).toBeNull();

    const body = container.querySelector(".embed-body")!;
    const emojiImgs = body.querySelectorAll('img[alt=":wave:"]');
    expect(emojiImgs).toHaveLength(1);
    expect(emojiImgs[0]).toHaveAttribute("src", "https://cdn.example/wave.gif");
  });

  it("does not replace shortcodes inside code or pre blocks", async () => {
    const emojiCollection = {
      ...emptyEmojis,
      "hydra:member": [
        {
          "@id": "/api/community_emojis/1",
          "@type": "CommunityEmoji",
          id: 1,
          shortcode: ":wave:",
          name: "Wave",
          image: {
            "@id": "/api/media_objects/1",
            "@type": "MediaObject",
            contentUrl: "https://cdn.example/wave.gif",
            mimeType: "image/gif",
            width: 32,
            height: 32,
          },
          position: 0,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
      "hydra:totalItems": 1,
    };
    server.use(
      http.get(`${BASE}/api/v1/messages/${UUID}`, () =>
        HttpResponse.json({
          ...message,
          text: "<p><code>:wave:</code></p><pre>:wave:</pre>",
        }),
      ),
      http.get(`${BASE}/api/v1/communities/demo`, () => HttpResponse.json(community)),
      http.get(`${BASE}/api/v1/communities/demo/emojis`, () => HttpResponse.json(emojiCollection)),
    );

    const { container } = render(<EmbedCard uuid={UUID} />);
    await waitFor(() => expect(screen.getByText("Test User")).toBeInTheDocument());

    const body = container.querySelector(".embed-body")!;
    expect(body.querySelectorAll("img")).toHaveLength(0);
    expect(body.querySelector("code")).toHaveTextContent(":wave:");
    expect(body.querySelector("pre")).toHaveTextContent(":wave:");
  });

  it("colors the author name with the theme-aware user text color", async () => {
    mockAllEndpoints();
    render(<EmbedCard uuid={UUID} />);
    await waitFor(() => expect(screen.getByText("Test User")).toBeInTheDocument());

    // Asserted on the inline value, not the computed one: the colour is a CSS
    // custom property that only resolves against embed.css in a real browser.
    expect((screen.getByText("Test User") as HTMLElement).style.color).toBe(
      getUserTextColor(mockUser.profile["@id"]),
    );
  });

  it("renders lucide icons instead of emoji for replies and file attachments", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${UUID}`, () =>
        HttpResponse.json({
          ...message,
          attachments: [
            {
              "@id": "/api/media_objects/9",
              "@type": "MediaObject",
              contentUrl: "https://cdn.example/notes.pdf",
              mimeType: "application/pdf",
            },
          ],
        }),
      ),
      http.get(`${BASE}/api/v1/communities/demo`, () => HttpResponse.json(community)),
      http.get(`${BASE}/api/v1/communities/demo/emojis`, () => HttpResponse.json(emptyEmojis)),
    );
    const { container } = render(<EmbedCard uuid={UUID} />);
    await waitFor(() => expect(screen.getByText("Test User")).toBeInTheDocument());

    const replies = container.querySelector(".embed-replies")!;
    expect(replies.querySelector("svg.embed-icon")).not.toBeNull();
    expect(replies.textContent).not.toContain("💬");

    const badge = container.querySelector(".embed-attachment-badge")!;
    expect(badge.querySelector("svg.embed-icon")).not.toBeNull();
    expect(badge.textContent).not.toContain("📎");
    expect(badge.textContent).toContain("1");
  });

  it("renders a video attachment as a poster thumbnail with play overlay in the media row", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${UUID}`, () =>
        HttpResponse.json({
          ...message,
          attachments: [
            {
              "@id": "/api/media_objects/7",
              "@type": "MediaObject",
              contentUrl: "https://cdn.example/clip.mp4",
              mimeType: "video/mp4",
            },
            {
              "@id": "/api/media_objects/8",
              "@type": "MediaObject",
              contentUrl: "https://cdn.example/photo.jpg",
              mimeType: "image/jpeg",
            },
          ],
        }),
      ),
      http.get(`${BASE}/api/v1/communities/demo`, () => HttpResponse.json(community)),
      http.get(`${BASE}/api/v1/communities/demo/emojis`, () => HttpResponse.json(emptyEmojis)),
    );
    const { container } = render(<EmbedCard uuid={UUID} />);
    await waitFor(() => expect(screen.getByText("Test User")).toBeInTheDocument());

    const wraps = container.querySelectorAll(".embed-attachment-image-wrap");
    expect(wraps).toHaveLength(2);

    const video = container.querySelector(".embed-attachments video")!;
    expect(video).toHaveAttribute("src", "https://cdn.example/clip.mp4");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).not.toHaveAttribute("controls");
    expect(container.querySelector(".embed-video-play")).not.toBeNull();

    expect(container.querySelector(".embed-attachments img")).toHaveAttribute(
      "src",
      "https://cdn.example/photo.jpg",
    );
    expect(container.querySelector(".embed-attachment-badge")).toBeNull();
  });

  it("shows the duration chip once video metadata loads", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${UUID}`, () =>
        HttpResponse.json({
          ...message,
          attachments: [
            {
              "@id": "/api/media_objects/7",
              "@type": "MediaObject",
              contentUrl: "https://cdn.example/clip.mp4",
              mimeType: "video/mp4",
            },
          ],
        }),
      ),
      http.get(`${BASE}/api/v1/communities/demo`, () => HttpResponse.json(community)),
      http.get(`${BASE}/api/v1/communities/demo/emojis`, () => HttpResponse.json(emptyEmojis)),
    );
    const { container } = render(<EmbedCard uuid={UUID} />);
    await waitFor(() => expect(screen.getByText("Test User")).toBeInTheDocument());

    expect(container.querySelector(".embed-video-duration")).toBeNull();

    const video = container.querySelector<HTMLVideoElement>(".embed-attachments video")!;
    Object.defineProperty(video, "duration", { value: 77, configurable: true });
    act(() => {
      video.dispatchEvent(new Event("loadedmetadata"));
    });

    await waitFor(() =>
      expect(container.querySelector(".embed-video-duration")).toHaveTextContent("1:17"),
    );
  });

  it("posts a tyto-embed-height message to the parent window after render", async () => {
    mockAllEndpoints();
    const postMessageSpy = vi.spyOn(window.parent, "postMessage");
    render(<EmbedCard uuid={UUID} />);

    await waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tyto-embed-height",
          uuid: UUID,
          height: expect.any(Number),
        }),
        "*",
      ),
    );
  });
});
