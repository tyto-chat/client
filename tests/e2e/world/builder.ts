import { request } from "@playwright/test";
import { totp } from "../totp";

export interface ChannelOptions {
  isPrivate?: boolean;
  isReadonly?: boolean;
}

/**
 * Builds E2E world state via direct API calls — no browser required.
 *
 * Pass a JWT to the constructor to create an authenticated context.
 * All authenticated methods use the JWT from `extraHTTPHeaders`, which
 * matches the pattern used by the original global.setup.ts (known working).
 *
 * For operations that require no auth (registration, getJwt), create an
 * instance without a JWT. Then create a second authenticated instance once
 * the JWT is obtained.
 *
 * The returned JWTs are handed to `authedPage()` (worldFixtures.ts), which
 * seeds them into localStorage before app scripts run — the auth transport this
 * app uses. (There is no storageState flow.)
 */
export class WorldBuilder {
  private api!: Awaited<ReturnType<typeof request.newContext>>;

  private readonly apiUrl: string;
  private readonly baseUrl: string;
  private readonly jwt: string | undefined;

  constructor(apiUrl: string, baseUrl: string, jwt?: string) {
    this.apiUrl = apiUrl;
    this.baseUrl = baseUrl;
    this.jwt = jwt;
  }

  async init(): Promise<void> {
    const extraHTTPHeaders: Record<string, string> = {
      "Content-Type": "application/ld+json",
      Accept: "application/ld+json",
    };
    if (this.jwt) {
      extraHTTPHeaders["Authorization"] = `Bearer ${this.jwt}`;
    }
    this.api = await request.newContext({
      baseURL: this.apiUrl,
      extraHTTPHeaders,
      ignoreHTTPSErrors: true,
    });
  }

  async dispose(): Promise<void> {
    await this.api.dispose();
  }

  /** POST /auth and return the JWT. No auth required. */
  async getJwt(email: string, password: string): Promise<string> {
    const res = await this.api.post("/auth", {
      data: { email, password },
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
    if (!res.ok()) {
      throw new Error(`Auth failed for ${email}: ${res.status()} ${await res.text()}`);
    }
    const { token } = (await res.json()) as { token: string };
    return token;
  }

  /**
   * Register a new user account. No auth required. Idempotent: a 422 whose
   * violation is "already registered" is treated as success so setup projects
   * can be re-run against a non-reset DB (the account already exists with the
   * same credentials).
   */
  async registerUser(email: string, password: string, displayName: string): Promise<void> {
    const res = await this.api.post("/api/v1/users", {
      data: { email, password, displayName },
    });
    if (!res.ok()) {
      const body = await res.text();
      if (res.status() === 422 && body.includes("already registered")) {
        return;
      }
      throw new Error(`Registration failed for ${email}: ${res.status()} ${body}`);
    }
  }

  async setDisplayName(name: string): Promise<void> {
    const meRes = await this.api.get("/api/v1/me");
    if (!meRes.ok()) throw new Error(`GET /api/v1/me failed: ${meRes.status()}`);
    const me = (await meRes.json()) as Record<string, unknown>;
    const profileIri = (me["profile"] as Record<string, unknown>)["@id"] as string;
    const patchRes = await this.api.patch(profileIri, {
      data: { name },
      headers: { "Content-Type": "application/merge-patch+json" },
    });
    if (!patchRes.ok()) {
      throw new Error(`PATCH profile failed: ${patchRes.status()} ${await patchRes.text()}`);
    }
  }

  /**
   * Stamp the authenticated user's onboardedAt so they skip the first-run
   * /welcome wizard (the root route bounces un-onboarded non-admins there).
   */
  async completeOnboarding(): Promise<void> {
    const res = await this.api.post("/api/v1/me/onboarding/complete", { data: {} });
    if (!res.ok()) {
      throw new Error(`Complete onboarding failed: ${res.status()} ${await res.text()}`);
    }
  }

  /**
   * Join a community as the authenticated user. Idempotent: a 409 "already a
   * member" is treated as success so setup projects can be re-run against a
   * non-reset DB without failing.
   */
  async joinCommunity(communityId: string): Promise<void> {
    const res = await this.api.post(`/api/v1/communities/${communityId}/members`, { data: {} });
    if (!res.ok() && res.status() !== 409) {
      throw new Error(`Join community failed: ${res.status()} ${await res.text()}`);
    }
  }

  /**
   * True if `GET /api/v1/communities/{communityId}` resolves (200). Used by
   * seedWorld's idempotency guard to skip creation when a worker reuses its
   * suffix after a retry. Requires a JWT that can VIEW the community (the
   * bootstrap admin always can).
   */
  async communityExists(communityId: string): Promise<boolean> {
    const res = await this.api.get(`/api/v1/communities/${communityId}`);
    if (res.ok()) return true;
    if (res.status() === 404) return false;
    throw new Error(
      `GET /api/v1/communities/${communityId} failed: ${res.status()} ${await res.text()}`,
    );
  }

  async createCommunity(
    name: string,
    options: { isPrivate?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    return this.apiPost("/api/v1/communities", { name, ...options });
  }

  /**
   * Create a bot account and make it the server default, so features that post
   * as the bot (welcome messages) actually fire. Idempotent: reuses the existing
   * default when one is already configured.
   */
  async ensureDefaultBot(name: string): Promise<number> {
    const config = (await this.apiGetPlain("/api/v1/admin/server-config")) as {
      defaultBotId: number;
    };
    if (config.defaultBotId > 0) return config.defaultBotId;

    const bot = (await this.apiPost("/api/v1/admin/users", {
      name,
      isBot: true,
    })) as unknown as { id: number };

    await this.apiPatch("/api/v1/admin/server-config", { defaultBotId: bot.id });
    return bot.id;
  }

  /** The community resource, for callers that need its IRI. */
  async getCommunity(communityId: string): Promise<Record<string, unknown>> {
    return this.apiGet(`/api/v1/communities/${communityId}`);
  }

  async createSection(communityId: string, name: string): Promise<Record<string, unknown>> {
    return this.apiPost(`/api/v1/communities/${communityId}/sections`, { name });
  }

  async createChannel(
    communityIri: string,
    sectionIri: string,
    name: string,
    type: "text" | "audio",
    options: ChannelOptions = {},
  ): Promise<Record<string, unknown>> {
    return this.apiPost("/api/v1/channels", {
      name,
      community: communityIri,
      section: sectionIri,
      type,
      ...options,
    });
  }

  async promoteToAdmin(communityId: string, memberDisplayName: string): Promise<void> {
    const membersRes = await this.api.get(`/api/v1/communities/${communityId}/members`);
    if (!membersRes.ok()) {
      throw new Error(`Fetch members failed: ${membersRes.status()} ${await membersRes.text()}`);
    }
    type MemberEntry = { id: number; profile: { name: string } };
    const data = (await membersRes.json()) as { "hydra:member": MemberEntry[] };
    const member = data["hydra:member"].find((m) => m.profile.name === memberDisplayName);
    if (!member) throw new Error(`Member "${memberDisplayName}" not found`);

    const patchRes = await this.api.patch(
      `/api/v1/communities/${communityId}/members/${member.id}`,
      {
        data: { role: "admin" },
        headers: { "Content-Type": "application/merge-patch+json" },
      },
    );
    if (!patchRes.ok()) {
      throw new Error(`Promote failed: ${patchRes.status()} ${await patchRes.text()}`);
    }
  }

  async findUserIdByName(name: string): Promise<number> {
    const res = await this.api.get(
      `/api/v1/me/invitable-users?search=${encodeURIComponent(name)}`,
      {
        headers: { Accept: "application/json" },
      },
    );
    if (!res.ok()) throw new Error(`Find user failed: ${res.status()} ${await res.text()}`);
    const data = (await res.json()) as { items: { id: number; name: string | null }[] };
    const match = data.items.find((u) => u.name === name);
    if (!match) throw new Error(`User "${name}" not found in invitable list`);
    return match.id;
  }

  /**
   * Create or fetch a conversation for the given participant set. Server is
   * idempotent — same participants → same conversation.
   */
  async createConversation(memberUserIds: number[]): Promise<{ identifier: string }> {
    const body = await this.apiPost("/api/v1/conversations", { memberUserIds });
    return body as { identifier: string };
  }

  /**
   * Delete every user-group in a community (admin auth required). Used by spec
   * cleanup so a group left owned by a non-admin (e.g. the group-owner spec)
   * doesn't flip `ownsAnyGroup` and surface the "Manage community" button in
   * later regular-user specs.
   */
  async deleteAllGroups(communityId: string): Promise<void> {
    const res = await this.api.get(`/api/v1/communities/${communityId}/groups`);
    if (!res.ok()) throw new Error(`List groups failed: ${res.status()} ${await res.text()}`);
    const body = (await res.json()) as { "hydra:member"?: { identifier: string }[] };
    for (const g of body["hydra:member"] ?? []) {
      const del = await this.api.delete(
        `/api/v1/communities/${communityId}/groups/${g.identifier}`,
      );
      if (!del.ok() && del.status() !== 404) {
        throw new Error(`Delete group ${g.identifier} failed: ${del.status()} ${await del.text()}`);
      }
    }
  }

  /**
   * Register + onboard + join a fresh member of the given community; returns
   * `{ jwt, name, email }`. Email is unique per invocation
   * (`${slug}-${Date.now()}@tyto.test`); password is `e2e-password`.
   *
   * Intended for tests that need a throwaway victim (e.g. moderation bans).
   * Pair with `authedPage(browser, member.jwt)` when a browser session is needed.
   */
  async createMember(
    communityId: string,
    name: string,
  ): Promise<{ jwt: string; name: string; email: string }> {
    const slugName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const email = `${slugName}-${Date.now()}@tyto.test`;
    const password = "e2e-password";

    const anon = await request.newContext({
      baseURL: this.apiUrl,
      extraHTTPHeaders: {
        "Content-Type": "application/ld+json",
        Accept: "application/ld+json",
      },
      ignoreHTTPSErrors: true,
    });
    let jwt: string;
    try {
      const regRes = await anon.post("/api/v1/users", {
        data: { email, password, displayName: name },
      });
      if (!regRes.ok()) {
        const body = await regRes.text();
        if (!(regRes.status() === 422 && body.includes("already registered"))) {
          throw new Error(`Registration failed for ${email}: ${regRes.status()} ${body}`);
        }
      }
      const authRes = await anon.post("/auth", {
        data: { email, password },
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      });
      if (!authRes.ok()) {
        throw new Error(`Auth failed for ${email}: ${authRes.status()} ${await authRes.text()}`);
      }
      const parsed = (await authRes.json()) as { token: string };
      jwt = parsed.token;
    } finally {
      await anon.dispose();
    }

    const member = await request.newContext({
      baseURL: this.apiUrl,
      extraHTTPHeaders: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/ld+json",
        Accept: "application/ld+json",
      },
      ignoreHTTPSErrors: true,
    });
    try {
      const onboardRes = await member.post("/api/v1/me/onboarding/complete", { data: {} });
      if (!onboardRes.ok()) {
        throw new Error(
          `Complete onboarding failed: ${onboardRes.status()} ${await onboardRes.text()}`,
        );
      }
      const joinRes = await member.post(`/api/v1/communities/${communityId}/members`, { data: {} });
      if (!joinRes.ok() && joinRes.status() !== 409) {
        throw new Error(`Join community failed: ${joinRes.status()} ${await joinRes.text()}`);
      }
    } finally {
      await member.dispose();
    }

    return { jwt, name, email };
  }

  /**
   * Enroll the authenticated user in TOTP two-factor via the API (setup →
   * confirm), returning the secret and the ten recovery codes. Used to reach
   * the "2FA is on" state without driving the enrollment wizard.
   */
  async enableTwoFactor(): Promise<{ secret: string; recoveryCodes: string[] }> {
    const setup = (await this.apiPost("/api/v1/users/me/2fa/setup", {})) as unknown as {
      secret: string;
    };
    const confirmed = (await this.apiPost("/api/v1/users/me/2fa/confirm", {
      code: totp(setup.secret),
    })) as unknown as { recoveryCodes: string[] };

    return { secret: setup.secret, recoveryCodes: confirmed.recoveryCodes };
  }

  /**
   * The authenticated user's notifications within a community. `/me/notifications`
   * is DM-only by design — community notifications hang off the community.
   */
  async getCommunityNotifications(communityId: string): Promise<{ type: string }[]> {
    const body = await this.apiGet(`/api/v1/communities/${communityId}/notifications`);
    return (body["hydra:member"] as { type: string }[] | undefined) ?? [];
  }

  /**
   * Issue a moderation action against a member. `type` follows
   * ModerationActionType (`warn`, `timeout`, `ban`, `server_ban`).
   */
  async moderate(
    communityId: string,
    targetUserId: number,
    type: "warn" | "timeout" | "ban",
    reason: string,
    expiresAt?: string,
  ): Promise<Record<string, unknown>> {
    return this.apiPost(`/api/v1/communities/${communityId}/moderation`, {
      targetUserId,
      type,
      reason,
      ...(expiresAt ? { expiresAt } : {}),
    });
  }

  /** True if `GET /communities/{communityId}/channels/{channelId}` resolves. */
  async channelExists(communityId: string, channelId: string): Promise<boolean> {
    const res = await this.api.get(`/api/v1/communities/${communityId}/channels/${channelId}`);
    if (res.ok()) return true;
    if (res.status() === 404) return false;
    throw new Error(`GET channel ${channelId} failed: ${res.status()} ${await res.text()}`);
  }

  /**
   * Create a text channel in an existing community, in a section of its own —
   * sections have no collection endpoint, so an existing one cannot be looked
   * up. Returns the derived identifier slug: read it from the response rather
   * than assuming it equals `name`, since Gedmo appends a numeric suffix on a
   * name collision.
   */
  async createTextChannel(communityId: string, name: string): Promise<string> {
    const community = await this.apiGet(`/api/v1/communities/${communityId}`);
    const section = await this.createSection(communityId, name);

    const channel = await this.createChannel(
      community["@id"] as string,
      section["@id"] as string,
      name,
      "text",
    );
    return channel["identifier"] as string;
  }

  /**
   * Post `texts` to a channel in order, one request at a time. Sequential by
   * design: page assignment follows insertion order, and the server rolls to a
   * new MessagePage once the current one holds 50 roots.
   */
  async sendChannelMessages(
    communityId: string,
    channelId: string,
    texts: string[],
  ): Promise<void> {
    for (const text of texts) {
      await this.apiPost(`/api/v1/communities/${communityId}/channels/${channelId}/messages`, {
        text,
      });
    }
  }

  /** Fetch one message page by number, hydrated messages included. */
  async getChannelPage(
    communityId: string,
    channelId: string,
    pageNumber: number,
  ): Promise<{ pageNumber: number; messages: { "@id": string; text: string | null }[] }> {
    const body = await this.apiGet(
      `/api/v1/communities/${communityId}/channels/${channelId}/pages/${pageNumber}`,
    );
    return body as unknown as {
      pageNumber: number;
      messages: { "@id": string; text: string | null }[];
    };
  }

  /** GET with a plain-JSON Accept, for endpoints that do not serve ld+json. */
  private async apiGetPlain(path: string): Promise<Record<string, unknown>> {
    const res = await this.api.get(path, { headers: { Accept: "application/json" } });
    if (!res.ok()) throw new Error(`GET ${path} failed: ${res.status()} ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  }

  private async apiPatch(path: string, data: object): Promise<Record<string, unknown>> {
    const res = await this.api.patch(path, {
      data,
      headers: { "Content-Type": "application/merge-patch+json", Accept: "application/json" },
    });
    if (!res.ok()) throw new Error(`PATCH ${path} failed: ${res.status()} ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  }

  private async apiGet(path: string): Promise<Record<string, unknown>> {
    const res = await this.api.get(path);
    if (!res.ok()) throw new Error(`GET ${path} failed: ${res.status()} ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  }

  private async apiPost(path: string, data: object): Promise<Record<string, unknown>> {
    const res = await this.api.post(path, { data });
    if (!res.ok()) throw new Error(`POST ${path} failed: ${res.status()} ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  }
}
