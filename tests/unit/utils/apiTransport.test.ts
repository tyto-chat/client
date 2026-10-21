import { describe, it, expect } from "vitest";
import { classifyProtocol, transportFromEntries } from "@/utils/apiTransport";

const API = "https://chat.example.com";

function entry(name: string, nextHopProtocol: string): PerformanceResourceTiming {
  return { name, nextHopProtocol } as PerformanceResourceTiming;
}

describe("classifyProtocol", () => {
  it.each([
    ["h2", "modern"],
    ["h3", "modern"],
    ["h3-29", "modern"],
    ["http/1.1", "legacy"],
    ["http/1.0", "legacy"],
    ["", "unknown"],
    ["spdy/3", "unknown"],
  ])("maps %s to %s", (protocol, expected) => {
    expect(classifyProtocol(protocol)).toBe(expected);
  });
});

describe("transportFromEntries", () => {
  it("ignores resources from other origins", () => {
    const entries = [entry("https://cdn.example.com/a.js", "http/1.1")];
    expect(transportFromEntries(entries, API)).toBe("unknown");
  });

  it("skips API entries whose protocol is hidden and uses the first readable one", () => {
    const entries = [
      entry(`${API}/api/v1/server-info`, ""),
      entry(`${API}/api/v1/me`, "http/1.1"),
      entry(`${API}/api/v1/communities`, "h2"),
    ];
    expect(transportFromEntries(entries, API)).toBe("legacy");
  });

  it("reports modern for h2", () => {
    expect(transportFromEntries([entry(`${API}/api/v1/me`, "h2")], API)).toBe("modern");
  });

  it("does not match a look-alike origin by prefix", () => {
    const entries = [entry("https://chat.example.com.evil/api", "http/1.1")];
    expect(transportFromEntries(entries, API)).toBe("unknown");
  });
});
