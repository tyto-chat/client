import { describe, it, expect } from "vitest";
import { desktopAppLink } from "@/utils/desktopAppLink";

describe("desktopAppLink", () => {
  it.each([
    ["https://chat.example", "tyto://open?url=https%3A%2F%2Fchat.example"],
    ["https://chat.example/api/", "tyto://open?url=https%3A%2F%2Fchat.example"],
    ["https://chat.example:8443", "tyto://open?url=https%3A%2F%2Fchat.example%3A8443"],
  ])("points the app at the server of %s", (serverUrl, link) => {
    expect(desktopAppLink(serverUrl)).toBe(link);
  });

  it.each([["http://chat.example"], [""], ["/api"], ["not a url"]])(
    "offers nothing for %s, which the app would refuse",
    (serverUrl) => {
      expect(desktopAppLink(serverUrl)).toBeNull();
    },
  );
});
