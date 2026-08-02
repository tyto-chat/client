import { http, HttpResponse } from "msw";

export const authHandlers = [
  http.post("*/auth", () => HttpResponse.json({ token: "mock-jwt-token" })),

  http.post("*/token/refresh", () => HttpResponse.json({ token: "mock-refreshed-token" })),

  http.post("*/logout", () => new HttpResponse(null, { status: 204 })),
];
