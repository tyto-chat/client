import { http, HttpResponse } from "msw";

export const mockCommunity = {
  "@id": "/api/communities/test-community",
  "@type": "Community",
  id: 1,
  identifier: "test-community",
  name: "Test Community",
  logoUrl: null,
};

export const communitiesHandlers = [
  http.get("*/api/v1/communities", () =>
    HttpResponse.json({
      "@context": "/api/contexts/Community",
      "@id": "/api/communities",
      "@type": "Collection",
      member: [mockCommunity],
      totalItems: 1,
    }),
  ),

  http.get("*/api/v1/communities/:identifier", () => HttpResponse.json(mockCommunity)),
];
