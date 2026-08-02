import { useRouteContext } from "@tanstack/react-router";

export function useVoiceEnabled(): boolean {
  const { serverInfo } = useRouteContext({ from: "__root__" });
  return serverInfo?.voiceEnabled ?? true;
}
