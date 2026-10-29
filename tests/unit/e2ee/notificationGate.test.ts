import { afterEach, describe, expect, it } from "vitest";
import { setActiveSecurity, type AdmissionConversation } from "@/e2ee/admission";
import { allowNotification } from "@/e2ee/notificationGate";
import type { LocalSecuritySnapshot } from "@/e2ee/localSecurityState";

const ORIGIN = "https://chat.example.org";

function snapshot(patch: Partial<LocalSecuritySnapshot> = {}): LocalSecuritySnapshot {
  return {
    scope: { serverOrigin: ORIGIN, serverUserId: 1, profileId: "p" },
    refusal: { on: false, since: 0 },
    knownBeforeRefusal: new Map(),
    acceptedPlainConversations: new Set(),
    pinnedUserIds: new Set(),
    ...patch,
  };
}

const conversations: Record<string, AdmissionConversation> = {
  plain: { id: 1, identifier: "plain", encrypted: false, members: [{ userId: 1 }, { userId: 2 }] },
  secret: { id: 2, identifier: "secret", encrypted: true, members: [{ userId: 1 }, { userId: 2 }] },
  accepted: {
    id: 3,
    identifier: "accepted",
    encrypted: false,
    members: [{ userId: 1 }, { userId: 2 }],
  },
};
const lookup = (identifier: string) => conversations[identifier];
const dm = (conversationIdentifier: string) => ({ type: "dm_message", conversationIdentifier });

afterEach(() => setActiveSecurity(null));

describe("allowNotification", () => {
  it("allows everything without local security state", () => {
    expect(allowNotification(dm("plain"), lookup)).toBe(true);
  });

  it("never touches notifications that are not direct messages", () => {
    setActiveSecurity(snapshot({ refusal: { on: true, since: 1 } }));

    expect(allowNotification({ type: "mention", conversationIdentifier: null }, lookup)).toBe(true);
  });

  it("drops refused plain conversations and unknown ones, keeps encrypted", () => {
    setActiveSecurity(snapshot({ refusal: { on: true, since: 1 } }));

    expect(allowNotification(dm("plain"), lookup)).toBe(false);
    expect(allowNotification(dm("unknown"), lookup)).toBe(false);
    expect(allowNotification(dm("secret"), lookup)).toBe(true);
  });

  it("drops plain conversations with a pinned peer that were never accepted", () => {
    setActiveSecurity(
      snapshot({ pinnedUserIds: new Set([2]), acceptedPlainConversations: new Set([3]) }),
    );

    expect(allowNotification(dm("plain"), lookup)).toBe(false);
    expect(allowNotification(dm("accepted"), lookup)).toBe(true);
    expect(allowNotification(dm("unknown"), lookup)).toBe(true);
  });

  it("uses only the state of the server the notification came from", () => {
    setActiveSecurity(snapshot({ refusal: { on: true, since: 1 } }));

    expect(allowNotification(dm("plain"), lookup, "https://other.example.org")).toBe(true);
    expect(allowNotification(dm("plain"), lookup, ORIGIN)).toBe(false);
  });
});
