import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearFakeDirectory,
  fakeEndpoint,
  registerFakeDirectory,
} from "../../mocks/serverDirectory";
import { configureApiClient } from "@/api/client";
import {
  _resetSessionHostsForTests,
  addRemoteContentHost,
  canAutoLoad,
  gateRemoteImages,
  getRemoteContentHosts,
  getRemoteContentLevel,
  hostMatches,
  revealRemoteImage,
  normalizeHost,
  setRemoteContentHosts,
  setRemoteContentLevel,
  alwaysLoadHost,
} from "@/utils/remoteContent";

beforeEach(() => {
  localStorage.clear();
  _resetSessionHostsForTests();
  configureApiClient("https://server.example.com/api/v1");
});

describe("normalizeHost on hostile input", () => {
  it("stays fast on a long run of slashes followed by a newline", () => {
    const hostile = `example.com${"/".repeat(60_000)}\nrest`;
    const started = performance.now();
    const result = normalizeHost(hostile);
    expect(performance.now() - started).toBeLessThan(250);
    expect(result).toBe("example.com");
  });

  it("cuts at the first slash", () => {
    expect(normalizeHost("https://www.Example.com/path/more?x=1")).toBe("example.com");
    expect(normalizeHost("example.com/a/b")).toBe("example.com");
    expect(normalizeHost("example.com")).toBe("example.com");
  });
});

describe("canAutoLoad with added servers", () => {
  afterEach(clearFakeDirectory);

  it("loads media from the typed and the api origin of an added server", () => {
    registerFakeDirectory(
      [fakeEndpoint("ib", "https://b.example", { apiOrigin: "https://api.b.example" })],
      "ia",
    );
    expect(canAutoLoad("https://b.example/media/x/a.png")).toBe(true);
    expect(canAutoLoad("https://api.b.example/media/x/a.png")).toBe(true);
  });

  it("still gates an unknown host and a lookalike of an added server", () => {
    registerFakeDirectory([fakeEndpoint("ib", "https://b.example")], "ia");
    expect(canAutoLoad("https://stranger.example/a.png")).toBe(false);
    expect(canAutoLoad("https://b.example.evil.com/a.png")).toBe(false);
  });

  it("gates everything external when no directory is registered", () => {
    expect(canAutoLoad("https://b.example/media/x/a.png")).toBe(false);
  });
});

describe("canAutoLoad", () => {
  it("defaults to the viewer's own list, which starts empty", () => {
    expect(canAutoLoad("https://i.imgur.com/a.png")).toBe(false);
    expect(canAutoLoad("https://www.youtube.com/")).toBe(false);
  });

  it("matches added hosts exactly or as a parent domain", () => {
    setRemoteContentHosts(["imgur.com", "cdn.example.net"]);
    expect(canAutoLoad("https://imgur.com/a.png")).toBe(true);
    expect(canAutoLoad("https://i.imgur.com/a.png")).toBe(true);
    expect(canAutoLoad("https://img.cdn.example.net/a.png")).toBe(true);
    expect(canAutoLoad("https://notimgur.com/a.png")).toBe(false);
  });

  it("always allows the viewer's own server, the page origin and data URLs", () => {
    expect(canAutoLoad("https://server.example.com/media/x/a.png")).toBe(true);
    expect(canAutoLoad(`${window.location.origin}/logo.png`)).toBe(true);
    expect(canAutoLoad("data:image/png;base64,AAAA")).toBe(true);
  });

  it("allows everything under all", () => {
    setRemoteContentLevel("all");
    expect(canAutoLoad("https://evil.example/a.png")).toBe(true);
  });

  it("rejects unparsable URLs", () => {
    setRemoteContentLevel("all");
    expect(canAutoLoad("http://")).toBe(false);
  });
});

describe("storage", () => {
  it("ignores unknown levels and corrupt host lists", () => {
    localStorage.setItem("remoteContent", "trusted");
    localStorage.setItem("remoteContentHosts", "{not json");
    expect(getRemoteContentLevel()).toBe("custom");
    expect(getRemoteContentHosts()).toEqual([]);
  });

  it("addRemoteContentHost appends once and persists", () => {
    expect(addRemoteContentHost("imgur.com")).toEqual(["imgur.com"]);
    expect(addRemoteContentHost("imgur.com")).toEqual(["imgur.com"]);
    expect(addRemoteContentHost("giphy.com")).toEqual(["imgur.com", "giphy.com"]);
    expect(getRemoteContentHosts()).toEqual(["imgur.com", "giphy.com"]);
  });
});

describe("hostMatches", () => {
  it("matches exact hosts and subdomains only", () => {
    expect(hostMatches("imgur.com", "imgur.com")).toBe(true);
    expect(hostMatches("i.imgur.com", "imgur.com")).toBe(true);
    expect(hostMatches("notimgur.com", "imgur.com")).toBe(false);
    expect(hostMatches("imgur.com", "i.imgur.com")).toBe(false);
  });
});

describe("revealRemoteImage", () => {
  it("allows the placeholder's host for the session without touching the list", () => {
    const button = document.createElement("button");
    button.dataset.remoteSrc = "https://cdn.session.example/a.png";
    expect(canAutoLoad("https://cdn.session.example/b.png")).toBe(false);

    revealRemoteImage(button);

    expect(canAutoLoad("https://cdn.session.example/b.png")).toBe(true);
    expect(canAutoLoad("https://session.example/b.png")).toBe(false);
    expect(getRemoteContentHosts()).toEqual([]);
  });
});

describe("normalizeHost", () => {
  it("accepts bare hosts and strips scheme, www and paths", () => {
    expect(normalizeHost(" Example.COM ")).toBe("example.com");
    expect(normalizeHost("https://www.cdn.example.net/path?q=1")).toBe("cdn.example.net");
    expect(normalizeHost("localhost")).toBeNull();
    expect(normalizeHost("-bad.example.com")).toBeNull();
    expect(normalizeHost("")).toBeNull();
  });
});

describe("alwaysLoadHost", () => {
  it("keeps the exact host so shared hosting tenants stay separate", () => {
    expect(alwaysLoadHost("i.imgur.com")).toBe("i.imgur.com");
    expect(alwaysLoadHost("www.example.com")).toBe("example.com");
    expect(alwaysLoadHost("alice.github.io")).toBe("alice.github.io");
  });

  it("allowing one github.io site does not allow another", () => {
    setRemoteContentHosts([alwaysLoadHost("alice.github.io")]);
    expect(canAutoLoad("https://alice.github.io/a.png")).toBe(true);
    expect(canAutoLoad("https://attacker.github.io/a.png")).toBe(false);
  });
});

const LABELS = {
  load: (host: string) => `Load from ${host}`,
  always: (d: string) => `Always ${d}`,
};

describe("gateRemoteImages", () => {
  it("swaps foreign images for a placeholder and keeps own-server ones", () => {
    const html =
      '<p><img src="https://cdn.evil.example/a.png" alt="x"> <img src="https://server.example.com/media/e.png" alt="e"></p>';
    const out = gateRemoteImages(html, LABELS);
    expect(out).toContain('data-remote-src="https://cdn.evil.example/a.png"');
    expect(out).toContain("Load from cdn.evil.example");
    expect(out).toContain('data-remote-host="cdn.evil.example"');
    expect(out).toContain("Always cdn.evil.example");
    expect(out).toContain('<img src="https://server.example.com/media/e.png" alt="e">');
    expect(out).not.toContain('<img src="https://cdn.evil.example');
  });

  it("returns html without images untouched", () => {
    expect(gateRemoteImages("<p>hi</p>", LABELS)).toBe("<p>hi</p>");
  });
});
