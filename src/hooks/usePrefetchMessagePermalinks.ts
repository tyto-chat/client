import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/types/api";
import { prefetchMessagePermalinks } from "@/utils/prefetchMessagePermalinks";

export function usePrefetchMessagePermalinks(messages: readonly Message[]): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    void prefetchMessagePermalinks(queryClient, messages);
  }, [queryClient, messages]);
}
