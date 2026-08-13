import { setRefreshExecutor } from "@/api/auth";
import { secretKey, type DesktopIdentity } from "@/desktop/desktopConfig";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import { IdentityAgent, type AgentNotificationEvent, type AgentSnapshot } from "./IdentityAgent";

export interface RegistrySnapshot {
  agents: AgentSnapshot[];
  activeIdentityId: string | null;
}

type NotificationListener = (event: AgentNotificationEvent) => void;

export class AgentRegistry {
  private bridge: PlatformBridge;
  private profileId: string | null = null;
  private agents = new Map<string, IdentityAgent>();
  private activeIdentityId: string | null = null;
  private listeners = new Set<() => void>();
  private notificationListeners = new Set<NotificationListener>();
  private snapshot: RegistrySnapshot;

  constructor(bridge: PlatformBridge) {
    this.bridge = bridge;
    this.snapshot = { agents: [], activeIdentityId: null };
  }

  async boot(
    profileId: string,
    identities: DesktopIdentity[],
    activeIdentityId: string,
  ): Promise<void> {
    this.profileId = profileId;
    for (const identity of identities) {
      this.spawnAgent(identity);
    }
    this.setActiveIdentity(activeIdentityId);
    for (const agent of this.agents.values()) {
      agent.start();
    }
    this.rebuildSnapshot();
  }

  setActiveIdentity(id: string): void {
    this.activeIdentityId = id;
    setRefreshExecutor(async () => {
      const agent = this.agents.get(id);
      if (!agent) throw new Error("agent_registry_no_active_agent");
      return agent.refreshNow();
    });
    this.rebuildSnapshot();
  }

  getAgent(id: string): IdentityAgent | undefined {
    return this.agents.get(id);
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
    const agent = this.spawnAgent(identity);
    agent.start();
    this.rebuildSnapshot();
  }

  stopAll(): void {
    for (const agent of this.agents.values()) {
      agent.stop();
    }
  }

  private spawnAgent(identity: DesktopIdentity): IdentityAgent {
    const profileId = this.profileId;
    if (!profileId) throw new Error("agent_registry_not_booted");
    const agent = new IdentityAgent(this.bridge, profileId, identity, {
      onChange: () => this.rebuildSnapshot(),
      onNotification: (event) => this.emitNotification(event),
      persistRotatedToken: async (refreshToken) => {
        await this.bridge.secrets.set(
          secretKey(profileId, identity.id, "refreshToken"),
          refreshToken,
        );
      },
    });
    this.agents.set(identity.id, agent);
    return agent;
  }

  private emitNotification(event: AgentNotificationEvent): void {
    for (const listener of this.notificationListeners) listener(event);
  }

  private rebuildSnapshot(): void {
    this.snapshot = {
      agents: Array.from(this.agents.values(), (agent) => agent.getSnapshot()),
      activeIdentityId: this.activeIdentityId,
    };
    for (const listener of this.listeners) listener();
  }
}
