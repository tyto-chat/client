import { describe, it, expect, vi } from "vitest";
import { classifyProtocol, observeApiTransport, transportFromEntries } from "@/utils/apiTransport";

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

describe("observeApiTransport", () => {
  it("never reports for a plain-HTTP origin, where browsers cannot negotiate HTTP/2", () => {
    const onResult = vi.fn();
    const entries = [entry("http://localhost:8000/api/v1/me", "http/1.1")];
    vi.spyOn(performance, "getEntriesByType").mockReturnValue(entries);

    const stop = observeApiTransport("http://localhost:8000", onResult);
    stop();

    expect(onResult).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("reports a legacy https origin from buffered entries", () => {
    const onResult = vi.fn();
    const entries = [entry(`${API}/api/v1/me`, "http/1.1")];
    vi.spyOn(performance, "getEntriesByType").mockReturnValue(entries);

    observeApiTransport(API, onResult)();

    expect(onResult).toHaveBeenCalledWith("legacy");
    vi.restoreAllMocks();
  });
});
