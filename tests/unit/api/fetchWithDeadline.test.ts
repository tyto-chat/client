import { describe, it, expect, afterEach } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import {
  __setRequestTimeoutsForTests,
  bootRequestTimeoutMs,
  fetchWithDeadline,
  RequestDeadlineError,
  requestTimeoutMs,
} from "@/api/fetchWithDeadline";

afterEach(() => __setRequestTimeoutsForTests(null));

describe("fetchWithDeadline", () => {
  it("rejects with RequestDeadlineError when no response arrives in time", async () => {
    server.use(http.get("https://srv.example/slow", async () => delay("infinite")));
    await expect(fetchWithDeadline("https://srv.example/slow", {}, 20)).rejects.toBeInstanceOf(
      RequestDeadlineError,
    );
  });

  it("passes a timely response through", async () => {
    server.use(http.get("https://srv.example/fast", () => HttpResponse.json({ ok: true })));
    const response = await fetchWithDeadline("https://srv.example/fast", {}, 500);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("covers the response body, not just the headers", async () => {
    server.use(
      http.get(
        "https://srv.example/stall-body",
        () =>
          new HttpResponse(new ReadableStream({ start() {} }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    await expect(
      fetchWithDeadline("https://srv.example/stall-body", {}, 30),
    ).rejects.toBeInstanceOf(RequestDeadlineError);
  });

  it("keeps status and headers of a buffered empty response", async () => {
    server.use(
      http.delete("https://srv.example/gone", () => new HttpResponse(null, { status: 204 })),
    );
    const response = await fetchWithDeadline("https://srv.example/gone", { method: "DELETE" }, 500);
    expect(response.status).toBe(204);
    expect(response.ok).toBe(true);
  });

  it("keeps network errors distinct from deadlines", async () => {
    server.use(http.get("https://srv.example/down", () => HttpResponse.error()));
    await expect(fetchWithDeadline("https://srv.example/down", {}, 500)).rejects.not.toBeInstanceOf(
      RequestDeadlineError,
    );
  });

  it("uses shorter deadlines for boot requests, both overridable for tests", () => {
    expect(bootRequestTimeoutMs()).toBeLessThan(requestTimeoutMs());
    __setRequestTimeoutsForTests({ boot: 5, request: 7 });
    expect(bootRequestTimeoutMs()).toBe(5);
    expect(requestTimeoutMs()).toBe(7);
  });
});
