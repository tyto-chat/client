import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureApiClient } from "@/api/client";
import { linkScope } from "@/utils/linkScope";
import {
  clearFakeDirectory,
  fakeEndpoint,
  registerFakeDirectory,
} from "../../mocks/serverDirectory";

beforeEach(() => configureApiClient("https://api.current.example/api/v1"));
afterEach(clearFakeDirectory);

describe("linkScope", () => {
  it("is current for the active server's api origin", () => {
    expect(linkScope("https://api.current.example")).toEqual({ kind: "current" });
  });

  it("is null for an unknown host", () => {
    expect(linkScope("https://stranger.example")).toBeNull();
  });

  it("is foreign for a second added server", () => {
    registerFakeDirectory([fakeEndpoint("ib", "https://b.example")], "ia");
    const scope = linkScope("https://b.example");
    expect(scope?.kind).toBe("foreign");
    expect(scope?.kind === "foreign" && scope.endpoint.identityId).toBe("ib");
  });

  it("is current for the active endpoint's typed origin even when it differs from the api origin", () => {
    registerFakeDirectory(
      [
        fakeEndpoint("ia", "https://typed.current.example", {
          apiOrigin: "https://api.current.example",
        }),
      ],
      "ia",
    );
    expect(linkScope("https://typed.current.example")).toEqual({ kind: "current" });
  });

  it("is null for a lookalike of an added server", () => {
    registerFakeDirectory([fakeEndpoint("ib", "https://b.example")], "ia");
    expect(linkScope("https://b.example.evil.com")).toBeNull();
  });

  it("is null when the added server has no healthy connection", () => {
    registerFakeDirectory(
      [fakeEndpoint("ib", "https://b.example", { status: "unreachable" })],
      "ia",
    );
    expect(linkScope("https://b.example")).toBeNull();
  });
});
