import { apiClient } from "@/api/client";

export type HealthStatus = "ok" | "degraded" | "down" | "unknown";

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  error: string | null;
}

export interface AdminSystemInfo {
  cpuCount: number;
  cpuLoad1: number;
  cpuLoad5: number;
  cpuLoad15: number;
  memoryTotal: number;
  memoryUsed: number;
  memoryFree: number;
  diskTotal: number;
  diskFree: number;
  mediaSize: number;
}

export type ScheduledTaskStatus = "ok" | "failed";

export interface ScheduledTask {
  name: string;
  description: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: ScheduledTaskStatus | null;
}

export interface AdminHealthResponse {
  overall: HealthStatus;
  checks: HealthCheckResult[];
  system: AdminSystemInfo;
  scheduledTasks: ScheduledTask[];
}

export const fetchAdminHealth = (): Promise<AdminHealthResponse> =>
  apiClient.getJson<AdminHealthResponse>("/api/admin/health");
