import { useSyncExternalStore } from "react";
import { getServerInfo, subscribeServerInfo } from "@/api/serverInfo";

export function useServerInfo() {
  return useSyncExternalStore(subscribeServerInfo, getServerInfo);
}
