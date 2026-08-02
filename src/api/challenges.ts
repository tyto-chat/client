import { apiClient } from "@/api/client";

export function createChallenge(email: string): Promise<void> {
  return apiClient.post<void>("/api/challenges", { email });
}
