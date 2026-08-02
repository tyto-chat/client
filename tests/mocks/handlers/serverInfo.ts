import { http, HttpResponse } from "msw";

export const serverInfoHandlers = [
  http.get("*/api/v1/server-info", () =>
    HttpResponse.json({
      mercureUrl: "https://mercure.tyto-chat.ddev.site/.well-known/mercure",
      livekitUrl: null,
    }),
  ),
];
