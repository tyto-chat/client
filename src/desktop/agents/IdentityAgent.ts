import { resolveServerQuiet, VersionMismatchError } from "@/desktop/connectIdentity";
import { getApiVersionForOrigin } from "@/api/apiVersion";
import { refreshWithToken, loginAt } from "@/api/auth";
import { ApiError } from "@/api/client";
import { secretKey, type DesktopIdentity } from "@/desktop/desktopConfig";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import type { ServerInfo, NotificationMercureEvent } from "@/types/api";
import { decodeJwtPayload } from "@/utils/jwtPayload";
import type { ServerContext } from "./identityFetch";

export type AgentStatus =
  "connecting" | "healthy" | "auth-failed" | "unreachable" | "version-mismatch";

export interface AgentCommunity {
  id: number;
  identifier: string;
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
}

export interface AgentNotificationEvent {
  identityId: string;
  origin: string;
  serverName: string | null;
  raw: NotificationMercureEvent;
}

export interface AgentSnapshot {
  identityId: string;
  status: AgentStatus;
  serverName: string | null;
  origin: string;
  userId: number | null;
  communities: AgentCommunity[];
  unreadCounts: Record<string, number>;
  error: unknown;
}

export interface AgentCallbacks {
  onChange(snapshot: AgentSnapshot): void;
  onNotification(event: AgentNotificationEvent): void;
  persistRotatedToken(refreshToken: string): Promise<void>;
}

const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

class AuthFailedError extends Error {
  constructor() {
    super("auth_failed");
    this.name = "AuthFailedError";
  }
}

export class IdentityAgent {
  private bridge: PlatformBridge;
  private profileId: string;
  private identity: DesktopIdentity;
  private callbacks: AgentCallbacks;

  private status: AgentStatus = "connecting";
  private token: string | null = null;
  private serverInfoValue: ServerInfo | null = null;
  private apiVersionValue = "";
  private apiBase: string | null = null;
  private errorValue: unknown = null;
  private snapshot: AgentSnapshot;

  private stopped = true;
  private connectionId = 0;
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlightRefresh: Promise<string> | null = null;

  constructor(
    bridge: PlatformBridge,
    profileId: string,
    identity: DesktopIdentity,
    callbacks: AgentCallbacks,
  ) {
    this.bridge = bridge;
    this.profileId = profileId;
    this.identity = identity;
    this.callbacks = callbacks;
    this.snapshot = this.buildSnapshot();
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.connectionId += 1;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getSnapshot(): AgentSnapshot {
    return this.snapshot;
  }

  getAccessToken(): string | null {
    return this.token;
  }

  refreshNow(): Promise<string> {
    if (this.inFlightRefresh) return this.inFlightRefresh;
    const promise = this.performRefresh().finally(() => {
      this.inFlightRefresh = null;
    });
    this.inFlightRefresh = promise;
    return promise;
  }

  retry(): void {
    if (this.stopped) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryAttempt = 0;
    void this.connect();
  }

  serverContext(): ServerContext {
    return {
      origin: this.identity.serverUrl,
      apiVersion: this.apiVersionValue,
      getToken: () => this.token,
    };
  }

  serverInfo(): ServerInfo | null {
    return this.serverInfoValue;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const myId = ++this.connectionId;
    this.setStatus("connecting");

    let serverInfo: ServerInfo;
    try {
      serverInfo = await resolveServerQuiet(this.identity.serverUrl);
    } catch (error) {
      if (this.stopped || this.connectionId !== myId) return;
      if (error instanceof VersionMismatchError) {
        this.errorValue = error;
        this.setStatus("version-mismatch");
        return;
      }
      this.errorValue = error;
      this.setStatus("unreachable");
      this.scheduleRetry();
      return;
    }

    if (this.stopped || this.connectionId !== myId) return;
    this.serverInfoValue = serverInfo;
    this.apiVersionValue = getApiVersionForOrigin(this.identity.serverUrl);
    this.apiBase = serverInfo.apiUrl;

    try {
      const token = await this.authenticate(this.apiBase);
      if (this.stopped || this.connectionId !== myId) return;
      this.token = token;
      this.errorValue = null;
      this.retryAttempt = 0;
      this.setStatus("healthy");
      this.scheduleTokenRefresh(token);
    } catch (error) {
      if (this.stopped || this.connectionId !== myId) return;
      this.token = null;
      this.errorValue = error;
      if (error instanceof AuthFailedError) {
        this.setStatus("auth-failed");
        return;
      }
      this.setStatus("unreachable");
      this.scheduleRetry();
    }
  }

  private async performRefresh(): Promise<string> {
    if (!this.apiBase) {
      const error = new Error("identity_agent_not_connected");
      if (this.stopped) throw error;
      this.errorValue = error;
      this.setStatus("unreachable");
      this.scheduleRetry();
      throw error;
    }
    try {
      const token = await this.authenticate(this.apiBase);
      if (this.stopped) return token;
      this.token = token;
      this.errorValue = null;
      this.retryAttempt = 0;
      this.setStatus("healthy");
      this.scheduleTokenRefresh(token);
      return token;
    } catch (error) {
      if (this.stopped) throw error;
      this.token = null;
      this.errorValue = error;
      if (error instanceof AuthFailedError) {
        this.setStatus("auth-failed");
        throw error;
      }
      this.setStatus("unreachable");
      this.scheduleRetry();
      throw error;
    }
  }

  private async authenticate(apiBase: string): Promise<string> {
    const refreshKey = secretKey(this.profileId, this.identity.id, "refreshToken");
    const storedRefresh = await this.bridge.secrets.get(refreshKey);
    if (storedRefresh) {
      try {
        const { token, refreshToken } = await refreshWithToken(apiBase, storedRefresh);
        if (refreshToken) await this.callbacks.persistRotatedToken(refreshToken);
        return token;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
      }
    }
    return this.passwordFallback(apiBase);
  }

  private async passwordFallback(apiBase: string): Promise<string> {
    const passwordKey = secretKey(this.profileId, this.identity.id, "password");
    const password = await this.bridge.secrets.get(passwordKey);
    if (!password) throw new AuthFailedError();

    let tokens: { token: string; refreshToken: string | null; twoFactorRequired?: boolean };
    try {
      tokens = await loginAt(apiBase, this.identity.email, password);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid credentials") {
        throw new AuthFailedError();
      }
      throw error;
    }
    if (tokens.twoFactorRequired) throw new AuthFailedError();
    if (tokens.refreshToken) await this.callbacks.persistRotatedToken(tokens.refreshToken);
    return tokens.token;
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)];
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }

  private scheduleTokenRefresh(token: string): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.stopped) return;
    const payload = decodeJwtPayload<{ exp: number }>(token);
    const expMs = payload?.exp ? payload.exp * 1000 : null;
    const delay =
      expMs !== null ? Math.max(expMs - Date.now() - REFRESH_MARGIN_MS, 0) : REFRESH_MARGIN_MS;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshNow().catch(() => undefined);
    }, delay);
  }

  private setStatus(status: AgentStatus): void {
    this.status = status;
    this.rebuildSnapshot();
  }

  private rebuildSnapshot(): void {
    this.snapshot = this.buildSnapshot();
    this.callbacks.onChange(this.snapshot);
  }

  private buildSnapshot(): AgentSnapshot {
    return {
      identityId: this.identity.id,
      status: this.status,
      serverName: this.serverInfoValue?.name ?? null,
      origin: this.identity.serverUrl,
      userId: this.identity.userId,
      communities: [],
      unreadCounts: {},
      error: this.errorValue,
    };
  }
}
