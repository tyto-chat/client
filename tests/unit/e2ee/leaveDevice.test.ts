import { describe, expect, it } from "vitest";
import {
  createEncryptedConversation,
  decryptMessage,
  sendEncrypted,
} from "@/e2ee/conversationSession";
import { leaveDevice, resumeLeave } from "@/e2ee/leaveDevice";
import type { E2eeTransport } from "@/e2ee/transport";
import { FakeDeliveryServer } from "../../mocks/fakeDeliveryServer";
import { identityFor } from "../../mocks/e2eeIdentity";
import { memoryKeyStoreFactory } from "../../mocks/memoryKeyStore";

const ALICE = 1;
const BOB = 2;

async function setup() {
  const server = new FakeDeliveryServer();
  const laptop = await server.addDevice(ALICE);
  const phone = await server.addDevice(ALICE);
  const bobDevice = await server.addDevice(BOB);
  const keyStore = memoryKeyStoreFactory()();
  const alice = identityFor(server, ALICE, laptop);
  const bob = identityFor(server, BOB, bobDevice);
  const conversation = await createEncryptedConversation(alice, BOB);
  await bob.processWelcomes();
  const phoneTransport = server.transportFor(ALICE);
  const alicePhone = identityFor(server, ALICE, phone, { keyStore, transport: phoneTransport });
  await alicePhone.processWelcomes();
  const sent = await sendEncrypted(bob.session(conversation), "before leaving");
  await decryptMessage(alicePhone.session(conversation), server.message(sent.id));
  return { server, phone, alicePhone, keyStore, phoneTransport, conversation, sent };
}

describe("removing the device I am using", () => {
  it("leave_wipes_local_keys_before_network", async () => {
    const { phone, alicePhone, keyStore, phoneTransport, sent } = await setup();
    expect(await keyStore.getMessageKey(alicePhone.scope, { id: sent.id, rev: 0 })).not.toBeNull();
    const seenAtSend: unknown[] = [];
    const original = phoneTransport.sendLeaveRequest.bind(phoneTransport);
    phoneTransport.sendLeaveRequest = async (deviceId, request) => {
      seenAtSend.push(
        await keyStore.getMessageKey(alicePhone.scope, { id: sent.id, rev: 0 }),
        await keyStore.loadDeviceState(alicePhone.scope),
        await keyStore.loadRecords(alicePhone.scope, "pins"),
        phone.engine.keyDeleted(),
      );
      return original(deviceId, request);
    };

    await leaveDevice(alicePhone);

    expect(seenAtSend).toEqual([null, null, [], true]);
  });

  it("leave_request_retried_from_marker_after_crash", async () => {
    const { server, phone, alicePhone, keyStore, phoneTransport } = await setup();
    const original = phoneTransport.sendLeaveRequest.bind(phoneTransport);
    let failures = 1;
    const flaky: E2eeTransport = {
      ...phoneTransport,
      sendLeaveRequest: async (deviceId, request) => {
        if (failures > 0) {
          failures -= 1;
          throw new TypeError("Failed to fetch");
        }
        return original(deviceId, request);
      },
    };
    Object.assign(phoneTransport, { sendLeaveRequest: flaky.sendLeaveRequest });

    await leaveDevice(alicePhone);
    expect(server.users.get(ALICE)?.revocations).toEqual([]);

    expect(await resumeLeave(keyStore, alicePhone.scope, phoneTransport)).toBe(true);
    expect(server.users.get(ALICE)?.revocations.map((r) => r.deviceId)).toEqual([
      phone.credential.deviceId,
    ]);
    expect(await resumeLeave(keyStore, alicePhone.scope, phoneTransport)).toBe(false);
  });
});
