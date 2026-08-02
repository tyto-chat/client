import { http, HttpResponse } from "msw";

export const mockCommunityEmojis = [
  {
    "@id": "/api/community_emojis/1",
    "@type": "CommunityEmoji",
    id: 1,
    shortcode: ":thumbs_up:",
    name: null,
    image: {
      "@id": "/api/media_objects/8",
      "@type": "MediaObject",
      contentUrl: "/media/sig/thumbs.png",
      mimeType: "image/png",
      width: 64,
      height: 64,
    },
    position: 0,
    createdAt: "2026-05-16T00:00:00+00:00",
    updatedAt: "2026-05-16T00:00:00+00:00",
  },
  {
    "@id": "/api/community_emojis/2",
    "@type": "CommunityEmoji",
    id: 2,
    shortcode: ":tyto:",
    name: null,
    image: {
      "@id": "/api/media_objects/9",
      "@type": "MediaObject",
      contentUrl: "/media/sig/tyto.png",
      mimeType: "image/png",
      width: 64,
      height: 64,
    },
    position: 1,
    createdAt: "2026-05-16T00:00:00+00:00",
    updatedAt: "2026-05-16T00:00:00+00:00",
  },
];

export const communityEmojiHandlers = [
  http.get("*/api/v1/communities/:identifier/emojis", () =>
    HttpResponse.json({
      "@context": "/api/contexts/CommunityEmoji",
      "@id": "/api/communities/test-community/emojis",
      "@type": "hydra:Collection",
      "hydra:member": mockCommunityEmojis,
      "hydra:totalItems": mockCommunityEmojis.length,
    }),
  ),
];
