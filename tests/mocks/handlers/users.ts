import { http, HttpResponse } from "msw";
import { mockUser } from "../../fixtures";

export { mockUser };

export const usersHandlers = [
  http.get("*/api/v1/users/me", () => HttpResponse.json(mockUser)),

  http.patch("*/api/v1/profiles/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...mockUser.profile, ...body });
  }),
];
