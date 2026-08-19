import { resolveServerQuiet, VersionMismatchError } from "@/desktop/connectIdentity";
import { getApiVersionForOrigin } from "@/api/apiVersion";
import { refreshWithToken, loginAt, LoginRequestError } from "@/api/auth";
import { ApiError, avatarUrl, logoUrl } from "@/api/client";
import { subscribeMercure, type MercureHandlers } from "@/api/mercure";
import {
  loadDesktopConfig,
  saveDesktopConfig,
  secretKey,
  setIdentityProfile,
  type DesktopIdentity,
} from "@/desktop/desktopConfig";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import type {
  Community,
  HydraCollection,
  MyCommunityMembership,
  PinnedCommunity,
  ServerInfo,
  NotificationMercureEvent,
} from "@/types/api";
import { decodeJwtPayload } from "@/utils/jwtPayload";
import { parseMercureEvent } from "@/utils/parseMercureEvent";
import { identityFetch, unwrapMember, type ServerContext } from "./identityFetch";

export type ConnectionStatus =
  "connecting" | "healthy" | "auth-failed" | "unreachable" | "version-mismatch";

export interface ConnectionCommunity {
  id: number;
  identifier: string;
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  iri: string | null;
  member: boolean;
  pinned: boolean;
  isPrivate: boolean;
}

export interface ConnectionNotificationEvent {
  identityId: string;
  origin: string;
  serverName: string | null;
  raw: NotificationMercureEvent;
}

export interface ConnectionRailSeed {
  communities: Community[];
  pinned: PinnedCommunity[];
  memberships: MyCommunityMembership[];
}

export interface ConnectionSnapshot {
  identityId: string;
  status: ConnectionStatus;
  serverName: string | null;
  origin: string;
  userId: number | null;
  communities: ConnectionCommunity[];
  unreadCounts: Record<string, number>;
  conversationActivityAt: number | null;
  error: unknown;
}

export interface ConnectionCallbacks {
  onChange(snapshot: ConnectionSnapshot): void;
  onNotification(event: ConnectionNotificationEvent): void;
  persistRotatedToken(refreshToken: string): Promise<void>;
}

// Animated GIFs bypass server-side resizing, so this ceiling tracks the server's 1M avatar upload cap.
const MAX_CACHED_AVATAR_BYTES = 1_200_000;

interface MeProfileResponse {
  id: number;
  roles?: string[];
  profile?: {
    "@id"?: string | null;
    name?: string | null;
    avatar?: { contentUrl?: { sm: string; md: string; lg: string } | null } | null;
  } | null;
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function fetchAvatarDataUrl(ctx: ServerContext, source: string): Promise<string | null> {
  try {
    const url = /^https?:\/\//i.test(source) ? source : `${ctx.origin}${source}`;
    const token = ctx.getToken();
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: "omit",
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size <= MAX_CACHED_AVATAR_BYTES ? await blobToDataUrl(blob) : null;
  } catch {
    return null;
  }
}

const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REALTIME_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REALTIME_TOKEN_MIN_DELAY_MS = 30_000;

class AuthFailedError extends Error {
  constructor() {
    super("auth_failed");
    this.name = "AuthFailedError";
  }
}

function buildConnectionCommunities(
  memberships: MyCommunityMembership[],
  communities: Community[],
  pinned: PinnedCommunity[],
): ConnectionCommunity[] {
  const memberIds = new Set(memberships.map((m) => m.communityId));
  const pinnedIds = new Set(pinned.map((p) => p.community.id));
  const toConnectionCommunity = (c: Community): ConnectionCommunity => ({
    id: c.id,
    identifier: c.identifier,
    name: c.name,
    logoUrl: logoUrl(c.logo?.contentUrl ?? null),
    accentColor: c.accentColor,
    iri: c["@id"] ?? null,
    member: memberIds.has(c.id),
    pinned: pinnedIds.has(c.id),
    isPrivate: c.isPrivate === true,
  });
  const byId = new Map(communities.map((c) => [c.id, c]));
  const pinnedFirst = [...pinned]
    .sort((a, b) => a.position - b.position)
    .map((p) => byId.get(p.community.id) ?? p.community);
  const rest = communities.filter((c) => !pinnedIds.has(c.id));
  return [...pinnedFirst, ...rest].map(toConnectionCommunity);
}

export class IdentityConnection {
  private bridge: PlatformBridge;
  private profileId: string;
  private identity: DesktopIdentity;
  private callbacks: ConnectionCallbacks;

  private status: ConnectionStatus = "connecting";
  private token: string | null = null;
  private serverInfoValue: ServerInfo | null = null;
  private apiVersionValue = "";
  private apiBase: string | null = null;
  private errorValue: unknown = null;
  private snapshot: ConnectionSnapshot;

  private stopped = true;
  private connectionId = 0;
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlightRefresh: Promise<string> | null = null;

  private userIdValue: number | null = null;
  private communitiesValue: ConnectionCommunity[] = [];
  private railSeedValue: ConnectionRailSeed | null = null;
  private unreadCountsValue: Record<string, number> = {};
  private conversationActivityAtValue: number | null = null;
  private realtimeUnsubscribe: (() => void) | null = null;
  private realtimeRemintTimer: ReturnType<typeof setTimeout> | null = null;
  private dataRetryAttempt = 0;
  private dataRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    bridge: PlatformBridge,
    profileId: string,
    identity: DesktopIdentity,
    callbacks: ConnectionCallbacks,
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
    if (this.realtimeRemintTimer) {
      clearTimeout(this.realtimeRemintTimer);
      this.realtimeRemintTimer = null;
    }
    if (this.dataRetryTimer) {
      clearTimeout(this.dataRetryTimer);
      this.dataRetryTimer = null;
    }
    this.closeRealtimeSubscription();
  }

  getSnapshot(): ConnectionSnapshot {
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
      apiVersion: this.apiVersionValue || getApiVersionForOrigin(this.identity.serverUrl),
      getToken: () => this.token,
    };
  }

  serverInfo(): ServerInfo | null {
    return this.serverInfoValue;
  }

  railSeed(): ConnectionRailSeed | null {
    return this.railSeedValue;
  }

  refreshUnreadCounts(): Promise<void> {
    return this.refetchUnreadCounts(this.connectionId);
  }

  refreshData(): Promise<void> {
    return this.loadData(this.connectionId);
  }

  async refreshRailData(): Promise<void> {
    const myId = this.connectionId;
    const ctx = this.serverContext();
    const [memberships, communities, pinned] = await Promise.all([
      identityFetch<HydraCollection<MyCommunityMembership> | MyCommunityMembership[]>(
        ctx,
        "/me/community-memberships",
      ),
      identityFetch<HydraCollection<Community> | Community[]>(ctx, "/communities"),
      identityFetch<HydraCollection<PinnedCommunity> | PinnedCommunity[]>(
        ctx,
        "/me/pinned-communities",
      ),
    ]);
    if (this.stopped || this.connectionId !== myId) return;
    const membershipList = unwrapMember(memberships);
    const communityList = unwrapMember(communities);
    const pinnedList = unwrapMember(pinned);
    this.railSeedValue = {
      communities: communityList,
      pinned: pinnedList,
      memberships: membershipList,
    };
    this.communitiesValue = buildConnectionCommunities(membershipList, communityList, pinnedList);
    this.rebuildSnapshot();
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
      this.dataRetryAttempt = 0;
      void this.loadData(myId);
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
      const error = new Error("identity_connection_not_connected");
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
      if (error instanceof LoginRequestError && error.kind === "auth") {
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

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.rebuildSnapshot();
  }

  private rebuildSnapshot(): void {
    this.snapshot = this.buildSnapshot();
    this.callbacks.onChange(this.snapshot);
  }

  private buildSnapshot(): ConnectionSnapshot {
    return {
      identityId: this.identity.id,
      status: this.status,
      serverName: this.serverInfoValue?.name ?? null,
      origin: this.identity.serverUrl,
      userId: this.userIdValue ?? this.identity.userId,
      communities: this.communitiesValue,
      unreadCounts: this.unreadCountsValue,
      conversationActivityAt: this.conversationActivityAtValue,
      error: this.errorValue,
    };
  }

  private async cacheProfileForRelogin(me: MeProfileResponse, ctx: ServerContext): Promise<void> {
    const displayName = me.profile?.name ?? null;
    const avatarSource = avatarUrl(me.profile?.avatar?.contentUrl ?? null);
    const avatarColorKey = me.profile?.["@id"] ?? null;
    if (
      displayName === this.identity.displayName &&
      avatarSource === this.identity.avatarSource &&
      avatarColorKey === this.identity.avatarColorKey
    ) {
      return;
    }

    let avatarDataUrl: string | null = null;
    if (avatarSource) {
      avatarDataUrl =
        avatarSource === this.identity.avatarSource
          ? (this.identity.avatarDataUrl ?? null)
          : await fetchAvatarDataUrl(ctx, avatarSource);
    }

    const write = async (cachedAvatar: string | null): Promise<void> => {
      const config = await loadDesktopConfig(this.bridge);
      const next = setIdentityProfile(config, this.profileId, this.identity.id, {
        userId: me.id,
        displayName,
        avatarDataUrl: cachedAvatar,
        avatarSource,
        avatarColorKey,
      });
      await saveDesktopConfig(this.bridge, next);
      this.identity = {
        ...this.identity,
        userId: me.id,
        displayName,
        avatarDataUrl: cachedAvatar,
        avatarSource,
        avatarColorKey,
      };
    };

    try {
      await write(avatarDataUrl);
    } catch {
      // A big animated avatar can exhaust the storage quota; keep the name rather than losing the write.
      try {
        if (avatarDataUrl) await write(null);
      } catch {
        // Cached identity chrome is cosmetic; a failed write must not disturb the session.
      }
    }
  }

  private async loadData(myId: number): Promise<void> {
    if (this.stopped || this.connectionId !== myId) return;
    const ctx = this.serverContext();
    try {
      const [me, memberships, communities, pinned, counts, realtimeToken] = await Promise.all([
        identityFetch<MeProfileResponse>(ctx, "/me"),
        identityFetch<HydraCollection<MyCommunityMembership> | MyCommunityMembership[]>(
          ctx,
          "/me/community-memberships",
        ),
        identityFetch<HydraCollection<Community> | Community[]>(ctx, "/communities"),
        identityFetch<HydraCollection<PinnedCommunity> | PinnedCommunity[]>(
          ctx,
          "/me/pinned-communities",
        ),
        identityFetch<{ counts: Record<string, number> }>(ctx, "/notifications/unread-counts"),
        identityFetch<{ token: string; expiresAt: number }>(ctx, "/realtime/token"),
      ]);
      if (this.stopped || this.connectionId !== myId) return;
      this.dataRetryAttempt = 0;
      this.errorValue = null;
      this.userIdValue = me.id;
      const membershipList = unwrapMember(memberships);
      const communityList = unwrapMember(communities);
      const pinnedList = unwrapMember(pinned);
      this.railSeedValue = {
        communities: communityList,
        pinned: pinnedList,
        memberships: membershipList,
      };
      this.communitiesValue = buildConnectionCommunities(membershipList, communityList, pinnedList);
      this.unreadCountsValue = counts.counts;
      this.rebuildSnapshot();
      void this.cacheProfileForRelogin(me, ctx);
      this.subscribeRealtime(myId, me.id, realtimeToken.token, realtimeToken.expiresAt);
    } catch (error) {
      if (this.stopped || this.connectionId !== myId) return;
      this.errorValue = error;
      this.rebuildSnapshot();
      this.scheduleDataRetry(myId);
    }
  }

  private scheduleDataRetry(myId: number): void {
    if (this.dataRetryTimer) {
      clearTimeout(this.dataRetryTimer);
      this.dataRetryTimer = null;
    }
    if (this.stopped || this.connectionId !== myId) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.dataRetryAttempt, RETRY_DELAYS_MS.length - 1)];
    this.dataRetryAttempt += 1;
    this.dataRetryTimer = setTimeout(() => {
      this.dataRetryTimer = null;
      void this.loadData(myId);
    }, delay);
  }

  private subscribeRealtime(myId: number, userId: number, token: string, expiresAt: number): void {
    if (this.stopped || this.connectionId !== myId) return;
    this.closeRealtimeSubscription();
    const topics = [
      `/api/users/${userId}/notifications`,
      `/api/users/${userId}/conversation-activity`,
    ];
    const handlers: MercureHandlers = {
      onReconnect: () => void this.refetchUnreadCounts(myId),
      onStaleToken: () => void this.remintRealtimeToken(myId, userId),
      onSustainedFailure: () => {},
    };
    this.realtimeUnsubscribe = subscribeMercure(
      topics,
      (event) => this.handleRealtimeEvent(event),
      token,
      handlers,
      this.serverInfoValue?.mercureUrl,
    );
    this.scheduleRealtimeRemint(myId, userId, expiresAt);
  }

  private closeRealtimeSubscription(): void {
    this.realtimeUnsubscribe?.();
    this.realtimeUnsubscribe = null;
  }

  private scheduleRealtimeRemint(myId: number, userId: number, expiresAt: number): void {
    if (this.realtimeRemintTimer) {
      clearTimeout(this.realtimeRemintTimer);
      this.realtimeRemintTimer = null;
    }
    if (this.stopped || this.connectionId !== myId) return;
    const delay = Math.max(
      expiresAt * 1000 - Date.now() - REALTIME_TOKEN_REFRESH_MARGIN_MS,
      REALTIME_TOKEN_MIN_DELAY_MS,
    );
    this.realtimeRemintTimer = setTimeout(() => {
      this.realtimeRemintTimer = null;
      void this.remintRealtimeToken(myId, userId);
    }, delay);
  }

  private async remintRealtimeToken(myId: number, userId: number): Promise<void> {
    if (this.stopped || this.connectionId !== myId) return;
    try {
      const ctx = this.serverContext();
      const realtimeToken = await identityFetch<{ token: string; expiresAt: number }>(
        ctx,
        "/realtime/token",
      );
      if (this.stopped || this.connectionId !== myId) return;
      this.subscribeRealtime(myId, userId, realtimeToken.token, realtimeToken.expiresAt);
    } catch {
      if (this.stopped || this.connectionId !== myId) return;
      if (this.realtimeRemintTimer) clearTimeout(this.realtimeRemintTimer);
      this.realtimeRemintTimer = setTimeout(() => {
        this.realtimeRemintTimer = null;
        void this.remintRealtimeToken(myId, userId);
      }, REALTIME_TOKEN_MIN_DELAY_MS);
    }
  }

  private refetchUnreadCounts(myId: number): Promise<void> {
    if (this.stopped || this.connectionId !== myId) return Promise.resolve();
    const ctx = this.serverContext();
    return identityFetch<{ counts: Record<string, number> }>(ctx, "/notifications/unread-counts")
      .then((result) => {
        if (this.stopped || this.connectionId !== myId) return;
        this.unreadCountsValue = result.counts;
        this.rebuildSnapshot();
      })
      .catch(() => {});
  }

  private handleRealtimeEvent(event: MessageEvent): void {
    const parsed = parseMercureEvent<NotificationMercureEvent | { type: string }>(event);
    if (!parsed) return;

    if (parsed.type === "conversation.activity") {
      this.conversationActivityAtValue = Date.now();
      this.rebuildSnapshot();
      return;
    }

    if (parsed.type !== "notification") return;
    const data = parsed as NotificationMercureEvent;

    const isDm = data.notificationType === "dm_message";
    const key = isDm ? "dm" : String(data.communityId);
    this.unreadCountsValue = {
      ...this.unreadCountsValue,
      [key]: (this.unreadCountsValue[key] ?? 0) + 1,
    };
    this.rebuildSnapshot();

    this.callbacks.onNotification({
      identityId: this.identity.id,
      origin: this.identity.serverUrl,
      serverName: this.serverInfoValue?.name ?? null,
      raw: data,
    });
  }
}
