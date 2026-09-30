export function desktopAppLink(serverUrl: string): string | null {
  let server: URL;
  try {
    server = new URL(serverUrl);
  } catch {
    return null;
  }
  if (server.protocol !== "https:") return null;
  return `tyto://open?url=${encodeURIComponent(server.origin)}`;
}

export function openDesktopApp(link: string): void {
  window.location.assign(link);
}
