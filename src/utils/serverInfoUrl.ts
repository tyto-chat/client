export function resolveServerInfoUrl(): string | undefined {
  return (
    window.__TYTO_CONFIG__?.serverInfoUrl ??
    (import.meta.env.VITE_SERVER_INFO_URL as string | undefined)
  );
}
