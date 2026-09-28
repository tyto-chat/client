import { setRefreshExecutor } from "@/api/auth";
import { identityKind, secretKey, type DesktopIdentity } from "@/desktop/desktopConfig";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import { GuestConnection } from "./GuestConnection";
import {
  IdentityConnection,
  type ConnectionNotificationEvent,
  type ConnectionSnapshot,
} from "./IdentityConnection";

export type AnyConnection = IdentityConnection | GuestConnection;

export interface RegistrySnapshot {
  connections: ConnectionSnapshot[];
  activeIdentityId: string | null;
}

type NotificationListener = (event: ConnectionNotificationEvent) => void;

export class ConnectionRegistry {
  private bridge: PlatformBridge;
  private profileId: string | null = null;
  private connections = new Map<string, AnyConnection>();
  private activeIdentityId: string | null = null;
  private listeners = new Set<() => void>();
  private notificationListeners = new Set<NotificationListener>();
  private snapshot: RegistrySnapshot;

  constructor(bridge: PlatformBridge) {
    this.bridge = bridge;
    this.snapshot = { connections: [], activeIdentityId: null };
  }

  async boot(
    profileId: string,
    identities: DesktopIdentity[],
    activeIdentityId: string,
  ): Promise<void> {
    this.profileId = profileId;
    for (const identity of identities) {
      this.spawnConnection(identity);
    }
    this.setActiveIdentity(activeIdentityId);
    for (const connection of this.connections.values()) {
      connection.start();
    }
    this.rebuildSnapshot();
  }

  setActiveIdentity(id: string): void {
    this.activeIdentityId = id;
    this.installRefreshExecutor(id);
    this.rebuildSnapshot();
  }

  getConnection(id: string): AnyConnection | undefined {
    return this.connections.get(id);
  }

  getSnapshot(): RegistrySnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  addIdentity(identity: DesktopIdentity): void {
    const connection = this.spawnConnection(identity);
    connection.start();
    this.rebuildSnapshot();
  }

  remove(identityId: string): void {
    const connection = this.connections.get(identityId);
    if (!connection) return;
    connection.stop();
    this.connections.delete(identityId);
    if (this.activeIdentityId === identityId) {
      this.activeIdentityId = null;
      setRefreshExecutor(null);
    }
    this.rebuildSnapshot();
  }

  downgradeToGuestSession(identity: DesktopIdentity): void {
    this.replaceConnection({ ...identity, kind: "guest" });
  }

  upgradeToIdentity(identity: DesktopIdentity): void {
    this.replaceConnection({ ...identity, kind: "identity" });
  }

  stopAll(): void {
    for (const connection of this.connections.values()) {
      connection.stop();
    }
    this.connections.clear();
    setRefreshExecutor(null);
    this.rebuildSnapshot();
  }

  private replaceConnection(identity: DesktopIdentity): void {
    this.connections.get(identity.id)?.stop();
    const connection = this.spawnConnection(identity);
    connection.start();
    if (this.activeIdentityId === identity.id) this.installRefreshExecutor(identity.id);
    this.rebuildSnapshot();
  }

  private installRefreshExecutor(id: string): void {
    if (this.connections.get(id) instanceof GuestConnection) {
      setRefreshExecutor(null);
      return;
    }
    setRefreshExecutor(async () => {
      const connection = this.connections.get(id);
      if (!(connection instanceof IdentityConnection)) {
        throw new Error("connection_registry_no_active_connection");
      }
      return connection.refreshNow();
    });
  }

  private spawnConnection(identity: DesktopIdentity): AnyConnection {
    if (identityKind(identity) === "guest") {
      const guest = new GuestConnection(identity, { onChange: () => this.rebuildSnapshot() });
      this.connections.set(identity.id, guest);
      return guest;
    }
    const profileId = this.profileId;
    if (!profileId) throw new Error("connection_registry_not_booted");
    const connection = new IdentityConnection(this.bridge, profileId, identity, {
      onChange: () => this.rebuildSnapshot(),
      onNotification: (event) => this.emitNotification(event),
      persistRotatedToken: async (refreshToken) => {
        await this.bridge.secrets.set(
          secretKey(profileId, identity.id, "refreshToken"),
          refreshToken,
        );
      },
    });
    this.connections.set(identity.id, connection);
    return connection;
  }

  private emitNotification(event: ConnectionNotificationEvent): void {
    for (const listener of this.notificationListeners) listener(event);
  }

  private rebuildSnapshot(): void {
    this.snapshot = {
      connections: Array.from(this.connections.values(), (connection) => connection.getSnapshot()),
      activeIdentityId: this.activeIdentityId,
    };
    for (const listener of this.listeners) listener();
  }
}
