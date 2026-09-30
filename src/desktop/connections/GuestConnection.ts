import { getApiVersionForOrigin } from "@/api/apiVersion";
import { resolveServerQuiet, VersionMismatchError } from "@/desktop/connectIdentity";
import type { DesktopIdentity } from "@/desktop/desktopConfig";
import type { Community, HydraCollection, ServerInfo } from "@/types/api";
import {
  buildConnectionCommunities,
  RETRY_DELAYS_MS,
  type ConnectionCallbacks,
  type ConnectionCommunity,
  type ConnectionRailSeed,
  type ConnectionSnapshot,
  type ConnectionStatus,
} from "./IdentityConnection";
import { identityFetch, unwrapMember, type ServerContext } from "./identityFetch";

export class GuestConnection {
  private identity: DesktopIdentity;
  private callbacks: Pick<ConnectionCallbacks, "onChange">;

  private status: ConnectionStatus = "connecting";
  private serverInfoValue: ServerInfo | null = null;
  private apiVersionValue = "";
  private errorValue: unknown = null;
  private snapshot: ConnectionSnapshot;

  private stopped = true;
  private connectionId = 0;
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private communitiesValue: ConnectionCommunity[] = [];
  private railSeedValue: ConnectionRailSeed | null = null;

  constructor(identity: DesktopIdentity, callbacks: Pick<ConnectionCallbacks, "onChange">) {
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

  getSnapshot(): ConnectionSnapshot {
    return this.snapshot;
  }

  getAccessToken(): null {
    return null;
  }

  serverContext(): ServerContext {
    return {
      origin: this.identity.serverUrl,
      apiVersion: this.apiVersionValue || getApiVersionForOrigin(this.identity.serverUrl),
      getToken: () => null,
    };
  }

  serverInfo(): ServerInfo | null {
    return this.serverInfoValue;
  }

  railSeed(): ConnectionRailSeed | null {
    return this.railSeedValue;
  }

  async refreshRailData(): Promise<void> {
    await this.loadCommunities(this.connectionId);
  }

  refreshData(): Promise<void> {
    return this.refreshRailData();
  }

  refreshUnreadCounts(): Promise<void> {
    return Promise.resolve();
  }

  applyUnreadCounts(): void {}

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const myId = ++this.connectionId;
    this.setStatus("connecting");

    let serverInfo: ServerInfo;
    try {
      serverInfo = await resolveServerQuiet(this.identity.serverUrl);
    } catch (error) {
      if (this.stopped || this.connectionId !== myId) return;
      this.errorValue = error;
      if (error instanceof VersionMismatchError) {
        this.setStatus("version-mismatch");
        return;
      }
      this.setStatus("unreachable");
      this.scheduleRetry();
      return;
    }

    if (this.stopped || this.connectionId !== myId) return;
    this.serverInfoValue = serverInfo;
    this.apiVersionValue = getApiVersionForOrigin(this.identity.serverUrl);

    try {
      await this.loadCommunities(myId);
    } catch (error) {
      if (this.stopped || this.connectionId !== myId) return;
      this.errorValue = error;
      this.setStatus("unreachable");
      this.scheduleRetry();
      return;
    }

    if (this.stopped || this.connectionId !== myId) return;
    this.errorValue = null;
    this.retryAttempt = 0;
    this.setStatus("healthy");
  }

  private async loadCommunities(myId: number): Promise<void> {
    const ctx = this.serverContext();
    const communities = await identityFetch<HydraCollection<Community> | Community[]>(
      ctx,
      "/communities",
    );
    if (this.stopped || this.connectionId !== myId) return;
    const communityList = unwrapMember(communities);
    this.railSeedValue = { communities: communityList, pinned: [], memberships: [] };
    this.communitiesValue = buildConnectionCommunities([], communityList, []);
    this.rebuildSnapshot();
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
      kind: "guest",
      status: this.status,
      serverName: this.serverInfoValue?.name ?? null,
      origin: this.identity.serverUrl,
      userId: null,
      communities: this.communitiesValue,
      unreadCounts: {},
      conversationActivityAt: null,
      error: this.errorValue,
    };
  }
}
