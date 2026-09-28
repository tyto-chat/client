import { apiClient } from "@/api/client";
import { getAppMode } from "@/platform/appMode";

export function createChallenge(email: string): Promise<void> {
  return apiClient.post<void>("/api/challenges", { email, client: getAppMode() });
}
