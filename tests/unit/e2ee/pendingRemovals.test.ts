import { describe, expect, it } from "vitest";
import {
  createEncryptedConversation,
  decryptMessage,
  sendEncrypted,
} from "@/e2ee/conversationSession";
import { leaveDevice } from "@/e2ee/leaveDevice";
import { processPendingRemovals } from "@/e2ee/pendingRemovals";
import { FakeDeliveryServer } from "../../mocks/fakeDeliveryServer";
import { identityFor } from "../../mocks/e2eeIdentity";

const ALICE = 1;
const BOB = 2;

async function phoneHasLeft() {
  const server = new FakeDeliveryServer();
  const laptop = await server.addDevice(ALICE);
  const phone = await server.addDevice(ALICE);
  const bobDevice = await server.addDevice(BOB);
  const alice = identityFor(server, ALICE, laptop);
  const alicePhone = identityFor(server, ALICE, phone);
  const bob = identityFor(server, BOB, bobDevice);
  const conversation = await createEncryptedConversation(alice, BOB);
  await alicePhone.processWelcomes();
  await bob.processWelcomes();
  await leaveDevice(alicePhone);
  return { server, phone, alice, bob, conversation };
}

function removals(server: FakeDeliveryServer, identifier: string) {
  return server.conversationOf(identifier).commits.filter((c) => c.leaveRequestId !== null);
}

describe("pending removals", () => {
  it("peer_applies_removal_carrying_valid_leave_request", async () => {
    const { server, alice, bob, conversation } = await phoneHasLeft();

    expect(await processPendingRemovals(bob, conversation)).toBe(1);

    await alice.session(conversation).sync();
    const sent = await sendEncrypted(alice.session(conversation), "after the phone left");
    expect(await decryptMessage(bob.session(conversation), server.message(sent.id))).toEqual({
      text: "after the phone left",
    });
    expect(removals(server, conversation.identifier)).toHaveLength(1);
    expect(server.leaveRequests.every((l) => l.fulfilled)).toBe(true);
  });

  it("pending_removal_committed_by_next_online_device_own_or_peer", async () => {
    const { server, alice, bob, conversation } = await phoneHasLeft();

    expect(await processPendingRemovals(alice, conversation)).toBe(1);

    const [removal] = removals(server, conversation.identifier);
    expect(removal?.deviceId).toBe(alice.deviceId);
    await bob.session(conversation).sync();
    expect(await processPendingRemovals(bob, conversation)).toBe(0);
  });

  it("pending_removal_already_done_by_other_device_handled_on_409", async () => {
    const { server, alice, bob, conversation } = await phoneHasLeft();
    const stale = await server.transportFor(ALICE).fetchLeaveRequests(conversation.identifier);
    alice.transport.fetchLeaveRequests = async () => stale;
    await processPendingRemovals(bob, conversation);

    await expect(processPendingRemovals(alice, conversation)).resolves.toBe(0);

    expect(removals(server, conversation.identifier)).toHaveLength(1);
  });

  it("own_device_with_an_old_snapshot_removes_the_left_device_before_sending", async () => {
    const { server, phone, alice, conversation } = await phoneHasLeft();
    await alice.session(conversation).sync();

    await sendEncrypted(alice.session(conversation), "first message after the leave");

    const commits = server.conversationOf(conversation.identifier).commits;
    expect(commits.at(-1)?.leaveRequestId).not.toBeNull();
    expect(commits.at(-1)?.deviceId).toBe(alice.deviceId);
    expect(server.leaveRequests.every((l) => l.fulfilled)).toBe(true);
    expect(phone.engine.keyDeleted()).toBe(true);
  });

  it("a leave request event or a background sync completes the removal", async () => {
    const { server, alice, bob, conversation } = await phoneHasLeft();
    alice.session(conversation);
    bob.session(conversation);

    await bob.handleEvent({
      type: "mls.leave_request",
      conversationIdentifier: conversation.identifier,
    });
    await alice.syncAll();

    expect(removals(server, conversation.identifier)).toHaveLength(1);
    expect(server.leaveRequests.every((l) => l.fulfilled)).toBe(true);
  });
});
