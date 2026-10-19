import { afterEach, describe, expect, it } from "vitest";
import { configureApiClient } from "@/api/client";
import { permalinkOrigins, serverOrigin } from "@/utils/permalinkOrigins";

afterEach(() => configureApiClient(""));

describe("permalinkOrigins", () => {
  it("falls back to the page origin when no API base is configured", () => {
    expect(serverOrigin()).toBe(window.location.origin);
    expect(permalinkOrigins()).toEqual([window.location.origin]);
  });

  it("derives the server origin from the API base URL and keeps the page origin", () => {
    configureApiClient("https://server.example.com/api/v1/");
    expect(serverOrigin()).toBe("https://server.example.com");
    expect(permalinkOrigins()).toEqual(["https://server.example.com", window.location.origin]);
  });
});
