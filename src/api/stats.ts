import { apiClient } from "@/api/client";
import type { Stats } from "@/types/api";

export function fetchStats(): Promise<Stats> {
  return apiClient.getJson("/api/stats");
}
