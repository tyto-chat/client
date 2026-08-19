import { beforeEach, describe, expect, it } from "vitest";
import { persistWizardResult } from "@/desktop/identitySetup";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import {
  addIdentity,
  createDefaultConfig,
  identityKind,
  secretKey,
  type DesktopConfig,
} from "@/desktop/desktopConfig";
import type { AddIdentityResult } from "@/desktop/AddIdentityWizard";
import type { ServerInfo } from "@/types/api";

const ORIGIN = "https://srv.example";
const serverInfo = { apiUrl: `${ORIGIN}/api`, name: "Srv" } as ServerInfo;

function result(over: Partial<AddIdentityResult> = {}): AddIdentityResult {
  return {
    serverUrl: ORIGIN,
    email: "a@b.c",
    password: "pw",
    token: "jwt",
    refreshToken: "refresh",
    serverInfo,
    ...over,
  };
}

let config: DesktopConfig;
let profileId: string;

beforeEach(() => {
  config = createDefaultConfig();
  profileId = config.profiles[0]!.id;
});

describe("persistWizardResult", () => {
  it("creates a guest entry and writes no secrets", async () => {
    const bridge = createFakePlatformBridge();

    const next = await persistWizardResult(
      bridge,
      config,
      profileId,
      result({ guest: true, email: "", password: "", token: "", refreshToken: null }),
    );

    const identity = next.profiles[0]!.identities[0]!;
    expect(identityKind(identity)).toBe("guest");
    expect(identity.email).toBe("");
    expect(next.profiles[0]!.lastActiveIdentityId).toBe(identity.id);
    expect(await bridge.secrets.get(secretKey(profileId, identity.id, "password"))).toBeNull();
    expect(await bridge.secrets.get(secretKey(profileId, identity.id, "refreshToken"))).toBeNull();
  });

  it("upgrades an existing guest entry to an identity and stores its secrets", async () => {
    const bridge = createFakePlatformBridge();
    const seeded = addIdentity(config, profileId, {
      id: "g1",
      serverUrl: ORIGIN,
      email: "",
      userId: null,
      displayName: null,
      kind: "guest",
    });

    const next = await persistWizardResult(bridge, seeded, profileId, result());

    const identity = next.profiles[0]!.identities[0]!;
    expect(identity.id).toBe("g1");
    expect(identityKind(identity)).toBe("identity");
    expect(identity.email).toBe("a@b.c");
    expect(await bridge.secrets.get(secretKey(profileId, "g1", "password"))).toBe("pw");
    expect(await bridge.secrets.get(secretKey(profileId, "g1", "refreshToken"))).toBe("refresh");
  });

  it("downgrades an existing identity entry when the wizard returns a guest result", async () => {
    const bridge = createFakePlatformBridge();
    const seeded = addIdentity(config, profileId, {
      id: "i1",
      serverUrl: ORIGIN,
      email: "a@b.c",
      userId: 7,
      displayName: "Ada",
    });

    const next = await persistWizardResult(
      bridge,
      seeded,
      profileId,
      result({ guest: true, email: "", password: "", token: "", refreshToken: null }),
    );

    expect(identityKind(next.profiles[0]!.identities[0]!)).toBe("guest");
  });

  it("clears the cached profile when the account behind the entry changes", async () => {
    const bridge = createFakePlatformBridge();
    const seeded = addIdentity(config, profileId, {
      id: "i1",
      serverUrl: ORIGIN,
      email: "old@b.c",
      userId: 7,
      displayName: "Ada",
      avatarDataUrl: "data:image/png;base64,x",
      avatarSource: "/media/ada.png",
      avatarColorKey: "/api/profiles/7",
    });

    const next = await persistWizardResult(bridge, seeded, profileId, result({ email: "new@b.c" }));

    expect(next.profiles[0]!.identities[0]).toMatchObject({
      email: "new@b.c",
      userId: null,
      displayName: null,
      avatarDataUrl: null,
      avatarSource: null,
      avatarColorKey: null,
    });
  });

  it("keeps the cached profile when the same account signs back in", async () => {
    const bridge = createFakePlatformBridge();
    const seeded = addIdentity(config, profileId, {
      id: "i1",
      serverUrl: ORIGIN,
      email: "a@b.c",
      userId: 7,
      displayName: "Ada",
      avatarColorKey: "/api/profiles/7",
    });

    const next = await persistWizardResult(bridge, seeded, profileId, result());

    expect(next.profiles[0]!.identities[0]).toMatchObject({
      userId: 7,
      displayName: "Ada",
      avatarColorKey: "/api/profiles/7",
    });
  });
});
