import { http, HttpResponse } from "msw";

export const realtimeHandlers = [
  http.get("*/api/v1/realtime/token", () => HttpResponse.json({ token: "mock-realtime-token" })),
];
