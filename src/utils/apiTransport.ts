export type ApiTransport = "modern" | "legacy" | "unknown";

export function classifyProtocol(nextHopProtocol: string): ApiTransport {
  if (/^h[23]\b/.test(nextHopProtocol)) return "modern";
  if (/^http\/1\./.test(nextHopProtocol)) return "legacy";
  return "unknown";
}

export function transportFromEntries(
  entries: readonly PerformanceResourceTiming[],
  apiOrigin: string,
): ApiTransport {
  const prefix = apiOrigin.replace(/\/$/, "") + "/";
  for (const entry of entries) {
    if (!entry.name.startsWith(prefix)) continue;
    const transport = classifyProtocol(entry.nextHopProtocol);
    if (transport !== "unknown") return transport;
  }
  return "unknown";
}

export function observeApiTransport(
  apiOrigin: string,
  onResult: (transport: Exclude<ApiTransport, "unknown">) => void,
): () => void {
  if (!apiOrigin.startsWith("https:") || typeof PerformanceObserver === "undefined") {
    return () => {};
  }

  const settle = (entries: readonly PerformanceResourceTiming[]): boolean => {
    const transport = transportFromEntries(entries, apiOrigin);
    if (transport === "unknown") return false;
    onResult(transport);
    return true;
  };

  if (settle(performance.getEntriesByType("resource") as PerformanceResourceTiming[])) {
    return () => {};
  }

  const observer = new PerformanceObserver((list) => {
    if (settle(list.getEntries() as PerformanceResourceTiming[])) observer.disconnect();
  });
  observer.observe({ type: "resource", buffered: true });
  return () => observer.disconnect();
}
