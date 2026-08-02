import { http, HttpResponse } from "msw";

export const mockMessage = {
  "@id": "/api/messages/1",
  "@type": "Message",
  id: 1,
  text: "<p>Hello world</p>",
  channel: "/api/channels/1",
  author: {
    "@id": "/api/profiles/1",
    displayName: "Test User",
    avatarUrl: null,
  },
  createdAt: "2026-01-01T12:00:00+00:00",
  updatedAt: null,
  deletedAt: null,
  pageNumber: 1,
};

export const messagesHandlers = [
  http.get("*/api/v1/messages", () =>
    HttpResponse.json({
      "@context": "/api/contexts/Message",
      "@id": "/api/messages",
      "@type": "Collection",
      member: [mockMessage],
      totalItems: 1,
    }),
  ),

  http.post("*/api/v1/messages", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...mockMessage, ...body }, { status: 201 });
  }),

  http.patch("*/api/v1/messages/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...mockMessage, ...body });
  }),

  http.delete("*/api/v1/messages/:id", () => new HttpResponse(null, { status: 204 })),
];
