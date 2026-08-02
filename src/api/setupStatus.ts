import { apiClient } from "@/api/client";

export type SetupFixable = "ui" | "infra";

export interface SetupItem {
  key: string;
  satisfied: boolean;
  fixable: SetupFixable;
  deepLink: string | null;
}

export interface SetupStatus {
  needsAttention: boolean;
  items: SetupItem[];
}

export const fetchSetupStatus = (): Promise<SetupStatus> =>
  apiClient.getJson<SetupStatus>("/api/admin/setup-status");
