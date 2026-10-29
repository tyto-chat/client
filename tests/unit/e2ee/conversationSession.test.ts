import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  CommitRejectedError,
  createEncryptedConversation,
  decryptMessage,
  editEncrypted,
  FrozenGenerationError,
  PeerIdentityChangedError,
  sendEncrypted,
  type E2eeIdentity,
} from "@/e2ee/conversationSession";
import { accountKeyFingerprint, PlaintextTooLongError } from "@/e2ee/envelope";
import type { MlsEngine } from "@/e2ee/engine";
import { httpE2eeTransport } from "@/e2ee/transport";
import type { Conversation, Message } from "@/types/api";
import { FakeDeliveryServer, type FakeDevice } from "../../mocks/fakeDeliveryServer";
import { identityFor } from "../../mocks/e2eeIdentity";
import { ed25519Key, signedDevice, signedRevocation } from "../../mocks/e2eeKeys";
import { createFakeMlsEngine } from "../../mocks/fakeMlsEngine";
import { server as mockFetch } from "../../mocks/server";

const ALICE = 1;
const BOB = 2;
const CAROL = 3;

async function setup() {
  const server = new FakeDeliveryServer();
  const aliceDevice = await server.addDevice(ALICE);
  const bobDevice = await server.addDevice(BOB);
  const alice = identityFor(server, ALICE, aliceDevice);
  const bob = identityFor(server, BOB, bobDevice);
  return { server, aliceDevice, bobDevice, alice, bob };
}

async function pair() {
  const context = await setup();
  const conversation = await createEncryptedConversation(context.alice, BOB);
  await context.bob.processWelcomes();
  return {
    ...context,
    conversation,
    aliceSession: context.alice.session(conversation),
    bobSession: context.bob.session(conversation),
  };
}

async function read(identity: E2eeIdentity, conversation: Conversation, message: Message) {
  return decryptMessage(identity.session(conversation), message);
}

function instrument(engine: MlsEngine) {
  const counts: Record<string, number> = {};
  let inFlight = 0;
  let maxInFlight = 0;
  const wrapped = { ...engine } as MlsEngine;
  for (const name of ["encrypt", "decrypt", "stageIncomingCommit", "merge"] as const) {
    const original = engine[name].bind(engine) as (...args: unknown[]) => Promise<unknown>;
    (wrapped as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      counts[name] = (counts[name] ?? 0) + 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      try {
        return await original(...args);
      } finally {
        inFlight -= 1;
      }
    };
  }
  return { engine: wrapped, counts, maxInFlight: () => maxInFlight };
}

describe("conversation session", () => {
  it("create_then_peer_reads_first_message", async () => {
    const { alice, bob, conversation, server } = await pair();

    const sent = await sendEncrypted(alice.session(conversation), "hello bob");

    expect(conversation.encrypted).toBe(true);
    expect(await read(bob, conversation, server.message(sent.id))).toEqual({ text: "hello bob" });
    expect(await read(alice, conversation, server.message(sent.id))).toEqual({ text: "hello bob" });
  });

  it("reply_roundtrip_in_thread", async () => {
    const { alice, bob, conversation, server } = await pair();
    const root = await sendEncrypted(alice.session(conversation), "root");

    const reply = await sendEncrypted(bob.session(conversation), "in thread", root["@id"]);

    expect(server.message(reply.id).parent?.id).toBe(root.id);
    expect(await read(alice, conversation, server.message(reply.id))).toEqual({
      text: "in thread",
    });
  });

  it("edit_roundtrip_peer_reads_new_revision", async () => {
    const { alice, bob, conversation, server } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "first");
    expect(await read(bob, conversation, server.message(sent.id))).toEqual({ text: "first" });

    const edited = await editEncrypted(alice.session(conversation), sent["@id"], "second");

    expect(edited.revisionCount).toBe(2);
    expect(await read(bob, conversation, server.message(sent.id))).toEqual({ text: "second" });
    expect(await read(alice, conversation, server.message(sent.id))).toEqual({ text: "second" });
  });

  it("edit_of_thread_reply_roundtrip", async () => {
    const { alice, bob, conversation, server } = await pair();
    const root = await sendEncrypted(alice.session(conversation), "root");
    const reply = await sendEncrypted(bob.session(conversation), "reply", root["@id"]);

    await editEncrypted(bob.session(conversation), reply["@id"], "reply, edited");

    expect(await read(alice, conversation, server.message(reply.id))).toEqual({
      text: "reply, edited",
    });
  });

  it("stale_commit_recovers_after_409", async () => {
    const { alice, bob, conversation, server } = await pair();
    await alice.session(conversation).rotateKeys();

    await bob.session(conversation).rotateKeys();

    const commits = server.conversationOf(conversation.identifier).commits;
    expect(commits.map((c) => c.epoch)).toEqual([1, 2, 3]);
    expect(commits[2]?.deviceId).toBe(bob.deviceId);
    const sent = await sendEncrypted(bob.session(conversation), "after the race");
    expect(await read(alice, conversation, server.message(sent.id))).toEqual({
      text: "after the race",
    });
  });

  it("lost_response_resent_with_same_id_yields_one_message", async () => {
    const { alice, conversation, server } = await pair();
    server.dropResponse("sendMessage");

    const sent = await sendEncrypted(alice.session(conversation), "once");

    const sends = server.calls.filter((c) => c.method === "sendMessage");
    expect(sends).toHaveLength(2);
    expect(sends[0]?.args).toEqual(sends[1]?.args);
    expect([...server.messages.values()]).toHaveLength(1);
    expect(sent.id).toBe(sends[0]?.args[2]);
  });

  it("lost_commit_response_resent_with_same_commit_id", async () => {
    const { alice, conversation, server } = await pair();
    server.dropResponse("submitCommit");

    await alice.session(conversation).rotateKeys();

    const submits = server.calls.filter(
      (c) => c.method === "submitCommit" && (c.args[1] as { epoch: number }).epoch === 2,
    );
    expect(submits).toHaveLength(2);
    expect((submits[0]?.args[1] as { commitId: string }).commitId).toBe(
      (submits[1]?.args[1] as { commitId: string }).commitId,
    );
    expect(server.conversationOf(conversation.identifier).commits).toHaveLength(2);
  });

  it("duplicate_incoming_commit_ignored", async () => {
    const context = await setup();
    const spy = instrument(context.bobDevice.engine);
    const bob = identityFor(context.server, BOB, context.bobDevice, { engine: spy.engine });
    const conversation = await createEncryptedConversation(context.alice, BOB);
    await bob.processWelcomes();
    await context.alice.session(conversation).rotateKeys();

    await bob.session(conversation).sync();
    await bob.session(conversation).sync();
    await bob.handleEvent({ type: "mls.commit", conversationIdentifier: conversation.identifier });

    expect(spy.counts.stageIncomingCommit).toBe(1);
  });

  it("duplicate_incoming_message_ignored", async () => {
    const context = await setup();
    const spy = instrument(context.bobDevice.engine);
    const bob = identityFor(context.server, BOB, context.bobDevice, { engine: spy.engine });
    const conversation = await createEncryptedConversation(context.alice, BOB);
    await bob.processWelcomes();
    const sent = await sendEncrypted(context.alice.session(conversation), "only once");
    const message = context.server.message(sent.id);

    const results = await Promise.all([
      read(bob, conversation, message),
      read(bob, conversation, message),
    ]);
    const again = await read(bob, conversation, message);

    expect(results).toEqual([{ text: "only once" }, { text: "only once" }]);
    expect(again).toEqual({ text: "only once" });
    expect(spy.counts.decrypt).toBe(1);
  });

  it("operations_on_one_group_are_serialised", async () => {
    const context = await setup();
    const spy = instrument(context.bobDevice.engine);
    const bob = identityFor(context.server, BOB, context.bobDevice, { engine: spy.engine });
    const conversation = await createEncryptedConversation(context.alice, BOB);
    await bob.processWelcomes();
    const first = await sendEncrypted(context.alice.session(conversation), "one");
    const second = await sendEncrypted(context.alice.session(conversation), "two");
    await context.alice.session(conversation).rotateKeys();

    await Promise.all([
      read(bob, conversation, context.server.message(first.id)),
      sendEncrypted(bob.session(conversation), "three"),
      bob.session(conversation).sync(),
      read(bob, conversation, context.server.message(second.id)),
    ]);

    expect(spy.maxInFlight()).toBe(1);
  });

  it("crash_between_ratchet_and_key_save_impossible", async () => {
    const { alice, bob, conversation, server } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "survives");
    const acknowledge = vi.spyOn(bob.engine, "acknowledgeDecrypt");
    const commit = vi
      .spyOn(bob.keyStore, "commitTransaction")
      .mockRejectedValueOnce(new Error("disk full"));

    await expect(read(bob, conversation, server.message(sent.id))).rejects.toThrow("disk full");
    expect(await bob.keyStore.getMessageKey(bob.scope, { id: sent.id, rev: 0 })).toBeNull();
    expect(acknowledge).not.toHaveBeenCalled();

    commit.mockRestore();
    expect(await read(bob, conversation, server.message(sent.id))).toEqual({ text: "survives" });
    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(await bob.keyStore.getMessageKey(bob.scope, { id: sent.id, rev: 0 })).not.toBeNull();
  });

  it("message_key_saved_by_id_and_rev", async () => {
    const { alice, bob, conversation, server } = await pair();

    const sent = await sendEncrypted(alice.session(conversation), "keyed");
    await read(bob, conversation, server.message(sent.id));

    const mine = await alice.keyStore.getMessageKey(alice.scope, { id: sent.id, rev: 0 });
    const theirs = await bob.keyStore.getMessageKey(bob.scope, { id: sent.id, rev: 0 });
    expect(mine?.key).toHaveLength(32);
    expect(theirs?.key).toEqual(mine?.key);
  });

  it("edit_key_saved_as_new_revision", async () => {
    const { alice, conversation } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "v0");

    await editEncrypted(alice.session(conversation), sent["@id"], "v1");

    const v0 = await alice.keyStore.getMessageKey(alice.scope, { id: sent.id, rev: 0 });
    const v1 = await alice.keyStore.getMessageKey(alice.scope, { id: sent.id, rev: 1 });
    expect(v0).not.toBeNull();
    expect(v1).not.toBeNull();
    expect(v1?.key).not.toEqual(v0?.key);
  });

  it("sender_saved_with_key", async () => {
    const { alice, bob, conversation, server } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "who wrote this");

    await read(bob, conversation, server.message(sent.id));

    const stored = await bob.keyStore.getMessageKey(bob.scope, { id: sent.id, rev: 0 });
    expect(stored?.sender).toEqual({
      userId: ALICE,
      deviceId: alice.deviceId,
      accountKeyFingerprint: await accountKeyFingerprint(alice.accountPublicKey),
    });
  });

  it("foreign_device_without_chain_rejected_at_staging", async () => {
    const { alice, conversation, server, bob } = await pair();
    await bob.session(conversation).sync();
    const forger = await signedDevice(await ed25519Key(), { accountId: BOB });
    const engine = createFakeMlsEngine(forger.credential);
    const { state } = await engine.generateDevice(forger.credential);
    const commits = server.conversationOf(conversation.identifier).commits;
    const groupInfo = await groupInfoOf(bob.engine as FakeDevice["engine"], conversation);
    const staged = await engine.joinExternal(state, groupInfo);
    await server.submitRaw(BOB, conversation.identifier, {
      commitId: crypto.randomUUID(),
      deviceId: forger.credential.deviceId,
      epoch: commits.length + 1,
      generation: 1,
      commit: staged.commit as Uint8Array,
      groupInfo: staged.groupInfo as Uint8Array,
      welcomes: [],
    });

    await expect(alice.session(conversation).sync()).rejects.toThrow(CommitRejectedError);
    await expect(alice.session(conversation).sync()).rejects.toMatchObject({
      reason: "actor_chain_invalid",
    });
  });

  it("added_member_outside_participants_rejected_at_staging", async () => {
    const { alice, bob, bobDevice, conversation, server } = await pair();
    await bob.session(conversation).sync();
    const carol = await server.addDevice(CAROL);
    const staged = await bobDevice.engine.addMembers(
      bobDevice.engine.latest(),
      await groupIdOf(bob, conversation),
      [carol.packages[0] as Uint8Array],
    );
    await submitStaged(server, BOB, bobDevice, conversation, staged);

    await expect(alice.session(conversation).sync()).rejects.toMatchObject({
      reason: "added_not_a_participant",
    });
  });

  it("revoked_device_rejected_at_staging", async () => {
    const { alice, bob, bobDevice, conversation, server } = await pair();
    await bob.session(conversation).sync();
    const second = await server.addDevice(BOB);
    server.users.get(BOB)?.revocations.push({
      ...(await signedRevocation(
        { credential: bobDevice.credential, device: bobDevice.key },
        second.credential,
        1_700_000_000,
      )),
      leaveRequestId: null,
    });
    const staged = await bobDevice.engine.addMembers(
      bobDevice.engine.latest(),
      await groupIdOf(bob, conversation),
      [second.packages[0] as Uint8Array],
    );
    await submitStaged(server, BOB, bobDevice, conversation, staged);

    await expect(alice.session(conversation).sync()).rejects.toMatchObject({
      reason: "added_revoked",
    });
  });

  it("unreadable_after_generation_change", async () => {
    const { alice, conversation, server } = await pair();
    const reset = await resetBob(server, conversation);

    await alice.session(conversation).sync();
    const message = await reset.sendRaw("after my reset");

    expect(await read(alice, conversation, message)).toEqual({ unreadable: true });
  });

  it("send_into_frozen_generation_refused", async () => {
    const { alice, conversation, server } = await pair();
    await resetBob(server, conversation);

    await expect(sendEncrypted(alice.session(conversation), "too late")).rejects.toThrow(
      FrozenGenerationError,
    );
    expect(server.calls.some((c) => c.userId === ALICE && c.method === "sendMessage")).toBe(false);
  });

  it("message_in_frozen_generation_after_freeze_refused", async () => {
    const { alice, bob, conversation, server } = await pair();
    const late = await sendEncrypted(bob.session(conversation), "sent before the reset");
    await resetBob(server, conversation);
    await alice.session(conversation).sync();
    const forged = {
      ...server.message(late.id),
      createdAt: "2030-01-01T00:00:00Z",
      revisedAt: null,
    };

    expect(await read(alice, conversation, forged)).toEqual({ tampered: "frozen_generation" });
  });

  it("send_blocked_while_peer_identity_changed", async () => {
    const { alice, conversation, server } = await pair();
    const bobUser = server.users.get(BOB);
    if (bobUser === undefined) throw new Error("no bob");
    bobUser.account = await ed25519Key();

    await alice.session(conversation).sync();

    await expect(sendEncrypted(alice.session(conversation), "hi")).rejects.toThrow(
      PeerIdentityChangedError,
    );
    expect(await alice.pins.verification(BOB)).toBe("changed_blocked");
  });

  it("welcome_processed_on_event", async () => {
    const { alice, bob } = await setup();
    const conversation = await createEncryptedConversation(alice, BOB);
    expect(await bob.session(conversation).status()).toBe("awaiting_welcome");

    await bob.handleEvent({ type: "mls.welcome" });

    expect(await bob.session(conversation).status()).toBe("ready");
  });

  it("peer_key_pinned_after_first_contact", async () => {
    const { alice, bob } = await setup();
    expect(await alice.pins.has(BOB)).toBe(false);

    const conversation = await createEncryptedConversation(alice, BOB);
    expect(await alice.pins.has(BOB)).toBe(true);
    expect(await bob.pins.has(ALICE)).toBe(false);

    await bob.processWelcomes();
    expect(await bob.pins.has(ALICE)).toBe(true);
    expect(await bob.session(conversation).status()).toBe("ready");
  });

  it("plaintext_over_10000_chars_refused_before_encrypting", async () => {
    const { alice, conversation, server } = await pair();
    const encrypt = vi.spyOn(alice.engine, "encrypt");

    await expect(sendEncrypted(alice.session(conversation), "x".repeat(10_001))).rejects.toThrow(
      PlaintextTooLongError,
    );
    const sent = await sendEncrypted(alice.session(conversation), "é".repeat(10_000));
    await expect(
      editEncrypted(alice.session(conversation), sent["@id"], "y".repeat(10_001)),
    ).rejects.toThrow(PlaintextTooLongError);
    await expect(
      sendEncrypted(alice.session(conversation), "z".repeat(10_001), sent["@id"]),
    ).rejects.toThrow(PlaintextTooLongError);

    expect(encrypt).toHaveBeenCalledTimes(1);
    expect(server.calls.filter((c) => c.method === "sendMessage")).toHaveLength(1);
  });

  it("welcome_kept_when_conversation_lookup_fails_transiently", async () => {
    const { alice, bob, server } = await setup();
    const conversation = await createEncryptedConversation(alice, BOB);
    server.dropResponse("fetchConversation");

    expect(await bob.processWelcomes()).toEqual([]);
    expect(server.welcomes.every((w) => !w.delivered)).toBe(true);

    expect(await bob.processWelcomes()).toEqual([conversation.identifier]);
    expect(await bob.session(conversation).status()).toBe("ready");
  });

  it("welcome_kept_when_joining_fails_transiently", async () => {
    const { alice, bob, server } = await setup();
    const conversation = await createEncryptedConversation(alice, BOB);
    vi.spyOn(bob.engine, "joinFromWelcome").mockRejectedValueOnce(
      new Error("no device key for this account"),
    );

    expect(await bob.processWelcomes()).toEqual([]);
    expect(server.welcomes.every((w) => !w.delivered)).toBe(true);

    expect(await bob.processWelcomes()).toEqual([conversation.identifier]);
  });

  it("welcome_with_unchained_existing_member_rejected", async () => {
    const { server, bob, aliceDevice } = await setup();
    const target = await server.transportFor(ALICE).createEncryptedConversation([BOB]);
    const forged = await signedDevice(await ed25519Key(), { accountId: BOB });
    const forgedEngine = createFakeMlsEngine(forged.credential);
    const forgedState = await forgedEngine.generateDevice(forged.credential);
    const forgedPackage = (await forgedEngine.createKeyPackages(forgedState.state, 1, 60))
      .packages[0] as Uint8Array;
    const bobPackage = server.users.get(BOB)?.devices[0]?.packages.shift() as Uint8Array;
    const engine = createFakeMlsEngine(aliceDevice.credential);
    const base = await engine.generateDevice(aliceDevice.credential);
    const groupId = `${target.id}.1.forged`;
    await engine.merge(await engine.createGroup(base.state, groupId));
    const withForged = await engine.addMembers(engine.latest(), groupId, [forgedPackage]);
    await engine.merge(withForged);
    const withBob = await engine.addMembers(engine.latest(), groupId, [bobPackage]);
    for (const [epoch, staged, welcomes] of [
      [1, withForged, []],
      [2, withBob, [{ deviceId: bob.deviceId, data: withBob.welcomes[0] as Uint8Array }]],
    ] as const) {
      await server.submitRaw(ALICE, target.identifier, {
        commitId: crypto.randomUUID(),
        deviceId: aliceDevice.credential.deviceId,
        epoch,
        generation: 1,
        commit: staged.commit as Uint8Array,
        groupInfo: staged.groupInfo as Uint8Array,
        welcomes: [...welcomes],
      });
    }

    expect(await bob.processWelcomes()).toEqual([]);
    expect(await bob.session(target).status()).toBe("awaiting_welcome");
    expect(server.welcomes.every((w) => w.delivered)).toBe(true);
  });

  it("welcome_with_left_but_not_yet_removed_member_still_joins", async () => {
    const { server, alice, aliceDevice, bob } = await setup();
    const second = await server.addDevice(ALICE);
    const conversation = await createEncryptedConversation(alice, BOB);
    server.users.get(ALICE)?.revocations.push({
      ...(await signedRevocation(
        { credential: aliceDevice.credential, device: aliceDevice.key },
        second.credential,
      )),
      leaveRequestId: null,
    });

    expect(await bob.processWelcomes()).toEqual([conversation.identifier]);
  });

  it("losing_edit_leaves_no_key_for_the_winning_revision", async () => {
    const { server, alice, bob } = await setup();
    const otherDevice = await server.addDevice(ALICE);
    const conversation = await createEncryptedConversation(alice, BOB);
    await bob.processWelcomes();
    const other = identityFor(server, ALICE, otherDevice);
    await other.processWelcomes();
    const sent = await sendEncrypted(alice.session(conversation), "v0");
    const transport = alice.transport;
    const realEdit = transport.editMessage.bind(transport);
    let winning: Message | null = null;
    vi.spyOn(transport, "editMessage").mockImplementation(async (iri, text, base) => {
      if (winning === null) {
        await editEncrypted(other.session(conversation), iri, "from my other device");
        winning = server.message(sent.id);
      }
      return realEdit(iri, text, base);
    });

    await editEncrypted(alice.session(conversation), sent["@id"], "from this device");

    expect(await read(alice, conversation, winning as unknown as Message)).toEqual({
      text: "from my other device",
    });
    expect(await read(alice, conversation, server.message(sent.id))).toEqual({
      text: "from this device",
    });
  });

  it("revoked_member_removed_before_the_next_message", async () => {
    const { server, alice, bob, bobDevice } = await setup();
    const second = await server.addDevice(BOB);
    const conversation = await createEncryptedConversation(alice, BOB);
    await bob.processWelcomes();
    const removed = identityFor(server, BOB, second);
    await removed.processWelcomes();
    server.users.get(BOB)?.revocations.push({
      ...(await signedRevocation(
        { credential: bobDevice.credential, device: bobDevice.key },
        second.credential,
      )),
      leaveRequestId: null,
    });

    await alice.session(conversation).sync();
    const sent = await sendEncrypted(alice.session(conversation), "not for the removed device");

    const commits = server.conversationOf(conversation.identifier).commits;
    expect(commits).toHaveLength(2);
    expect(commits[1]?.deviceId).toBe(alice.deviceId);
    expect(await read(bob, conversation, server.message(sent.id))).toEqual({
      text: "not for the removed device",
    });
    expect(await read(removed, conversation, server.message(sent.id))).toEqual({
      unreadable: true,
    });
    expect(await removed.session(conversation).status()).toBe("removed");
  });

  it("own_revoked_device_removed_before_the_next_message", async () => {
    const { server, alice, aliceDevice, bob } = await setup();
    const second = await server.addDevice(ALICE);
    const conversation = await createEncryptedConversation(alice, BOB);
    await bob.processWelcomes();
    server.users.get(ALICE)?.revocations.push({
      ...(await signedRevocation(
        { credential: aliceDevice.credential, device: aliceDevice.key },
        second.credential,
      )),
      leaveRequestId: null,
    });

    await alice.session(conversation).sync();
    await sendEncrypted(alice.session(conversation), "only my current device");

    const commits = server.conversationOf(conversation.identifier).commits;
    expect(commits).toHaveLength(2);
    expect(commits[1]?.deviceId).toBe(alice.deviceId);
  });

  it("revoked_device_of_unpinned_peer_kept_out_of_new_group", async () => {
    const { server, alice, bob, bobDevice } = await setup();
    const revokedDevice = await server.addDevice(BOB);
    server.users.get(BOB)?.revocations.push({
      ...(await signedRevocation(
        { credential: bobDevice.credential, device: bobDevice.key },
        revokedDevice.credential,
      )),
      leaveRequestId: null,
    });

    await createEncryptedConversation(alice, BOB);

    expect(server.welcomes.map((w) => w.deviceId)).toEqual([bob.deviceId]);
    expect(await alice.revocations.isRevoked(revokedDevice.credential)).toBe(true);
  });

  it("removal_dropped_when_another_device_removed_the_target_first", async () => {
    const { server, alice, bob, bobDevice } = await setup();
    const second = await server.addDevice(BOB);
    const conversation = await createEncryptedConversation(alice, BOB);
    await bob.processWelcomes();
    await alice.session(conversation).sync();
    server.users.get(BOB)?.revocations.push({
      ...(await signedRevocation(
        { credential: bobDevice.credential, device: bobDevice.key },
        second.credential,
      )),
      leaveRequestId: null,
    });
    await alice.session(conversation).sync();
    const transport = alice.transport;
    const realSubmit = transport.submitCommit.bind(transport);
    let raced = false;
    vi.spyOn(transport, "submitCommit").mockImplementation(async (identifier, submission) => {
      if (!raced) {
        raced = true;
        const leaf = (await bob.keyStore.getRecord(bob.scope, "groups", identifier)) as Uint8Array;
        const roster = (
          JSON.parse(new TextDecoder().decode(leaf)) as {
            roster: { leafIndex: number; deviceId: string }[];
          }
        ).roster;
        const target = roster.find((m) => m.deviceId === second.credential.deviceId);
        const staged = await bobDevice.engine.removeMember(
          bobDevice.engine.latest(),
          await groupIdOf(bob, conversation),
          target?.leafIndex as number,
        );
        await bobDevice.engine.merge(staged);
        await submitStaged(server, BOB, bobDevice, conversation, staged);
      }
      return realSubmit(identifier, submission);
    });

    const sent = await sendEncrypted(alice.session(conversation), "after bob cleaned up");

    const commits = server.conversationOf(conversation.identifier).commits;
    expect(commits.map((c) => c.deviceId)).toEqual([alice.deviceId, bob.deviceId]);
    await bob
      .session(conversation)
      .sync()
      .catch(() => undefined);
    expect(server.message(sent.id).text).toMatch(/^e2ee:1:/);
  });

  it("accepted_edit_readable_after_crash_before_key_save", async () => {
    const { alice, bob, conversation, server } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "v0");
    const realCommit = alice.keyStore.commitTransaction.bind(alice.keyStore);
    vi.spyOn(alice.keyStore, "commitTransaction").mockImplementation(async (scope, change) => {
      if (change.messageKeys?.some((m) => m.ref.id === sent.id && m.ref.rev === 1)) {
        throw new Error("crashed");
      }
      return realCommit(scope, change);
    });

    await expect(editEncrypted(alice.session(conversation), sent["@id"], "v1")).rejects.toThrow(
      "crashed",
    );
    vi.mocked(alice.keyStore.commitTransaction).mockRestore();

    expect(server.message(sent.id).revisionCount).toBe(2);
    expect(await read(alice, conversation, server.message(sent.id))).toEqual({ text: "v1" });
    expect(await read(bob, conversation, server.message(sent.id))).toEqual({ text: "v1" });
  });

  it("removal_survives_crash_between_staging_and_merge", async () => {
    const { alice, aliceDevice, bob, bobDevice, conversation, server } = await pair();
    await bob.session(conversation).sync();
    const aliceRoster = JSON.parse(
      new TextDecoder().decode(
        (await alice.keyStore.getRecord(
          alice.scope,
          "groups",
          conversation.identifier,
        )) as Uint8Array,
      ),
    ) as { roster: { leafIndex: number; deviceId: string }[] };
    const bobLeaf = aliceRoster.roster.find((m) => m.deviceId === bob.deviceId)
      ?.leafIndex as number;
    const removal = await aliceDevice.engine.removeMember(
      aliceDevice.engine.latest(),
      await groupIdOf(alice, conversation),
      bobLeaf,
    );
    await submitStaged(server, ALICE, aliceDevice, conversation, removal);
    const groupId = await groupIdOf(bob, conversation);
    const staged = await bobDevice.engine.stageIncomingCommit(
      bobDevice.engine.latest(),
      groupId,
      removal.commit as Uint8Array,
    );
    const { decodeProgress, encodeProgress } = await import("@/e2ee/groupProgress");
    const progress = decodeProgress(
      (await bob.keyStore.getRecord(bob.scope, "groups", conversation.identifier)) as Uint8Array,
    );
    await bob.keyStore.commitTransaction(bob.scope, {
      records: [
        {
          kind: "groups",
          id: conversation.identifier,
          data: encodeProgress({
            ...progress,
            pending: {
              kind: "incoming",
              stageId: staged.id,
              groupId,
              epoch: 2,
              generation: 1,
              roster: staged.resultingRoster.map((m) => ({
                leafIndex: m.leafIndex,
                accountId: m.credential.accountId,
                deviceId: m.credential.deviceId,
                generation: m.credential.generation,
              })),
            },
          }),
        },
      ],
    });

    await bob.session(conversation).sync();

    expect(await bob.session(conversation).status()).toBe("removed");
  });

  it("offline_participant_catches_up_past_a_later_revoked_committer", async () => {
    const { server, alice, bob, bobDevice } = await setup();
    const secondDevice = await server.addDevice(BOB);
    const conversation = await createEncryptedConversation(alice, BOB);
    await bob.processWelcomes();
    const second = identityFor(server, BOB, secondDevice);
    await second.processWelcomes();
    await second.session(conversation).rotateKeys();
    server.users.get(BOB)?.revocations.push({
      ...(await signedRevocation(
        { credential: bobDevice.credential, device: bobDevice.key },
        secondDevice.credential,
      )),
      leaveRequestId: null,
    });
    await bob.session(conversation).sync();
    const sent = await sendEncrypted(bob.session(conversation), "after cleaning up");

    await alice.session(conversation).sync();

    expect(server.conversationOf(conversation.identifier).commits.map((c) => c.deviceId)).toEqual([
      alice.deviceId,
      second.deviceId,
      bob.deviceId,
    ]);
    expect(await read(alice, conversation, server.message(sent.id))).toEqual({
      text: "after cleaning up",
    });
  });

  it("commit_by_device_after_its_revocation_rejected", async () => {
    const { server, alice, bob, bobDevice } = await setup();
    const secondDevice = await server.addDevice(BOB);
    const conversation = await createEncryptedConversation(alice, BOB);
    await bob.processWelcomes();
    const second = identityFor(server, BOB, secondDevice);
    await second.processWelcomes();
    server.users.get(BOB)?.revocations.push({
      ...(await signedRevocation(
        { credential: bobDevice.credential, device: bobDevice.key },
        secondDevice.credential,
        1_700_000_000,
      )),
      leaveRequestId: null,
    });
    const rotation = await secondDevice.engine.addMembers(
      secondDevice.engine.latest(),
      await groupIdOf(second, conversation),
      [],
    );
    await submitStaged(server, BOB, secondDevice, conversation, rotation);

    await expect(alice.session(conversation).sync()).rejects.toMatchObject({
      reason: "actor_revoked",
    });
  });

  it("welcome_beyond_a_full_page_of_kept_ones_still_processed", async () => {
    const { server, alice, bob } = await setup();
    for (let i = 0; i < 50; i++) {
      server.welcomes.push({
        id: crypto.randomUUID(),
        deviceId: bob.deviceId,
        conversation: "gone-for-now",
        epoch: 1,
        generation: 1,
        data: new Uint8Array(1),
        delivered: false,
      });
    }
    const conversation = await createEncryptedConversation(alice, BOB);

    expect(await bob.processWelcomes()).toEqual([conversation.identifier]);
  });

  it("edit_by_revoked_device_after_revocation_refused", async () => {
    const { server, alice, bob, bobDevice } = await setup();
    const secondDevice = await server.addDevice(BOB);
    const conversation = await createEncryptedConversation(alice, BOB);
    await bob.processWelcomes();
    const second = identityFor(server, BOB, secondDevice);
    await second.processWelcomes();
    const sent = await sendEncrypted(second.session(conversation), "before revocation");
    const sentAt = Date.parse(server.message(sent.id).createdAt) / 1000;
    await sendEncrypted(alice.session(conversation), "time passes");
    server.users.get(BOB)?.revocations.push({
      ...(await signedRevocation(
        { credential: bobDevice.credential, device: bobDevice.key },
        secondDevice.credential,
        sentAt + 1,
      )),
      leaveRequestId: null,
    });
    expect(await read(alice, conversation, server.message(sent.id))).toEqual({
      text: "before revocation",
    });
    await alice.session(conversation).sync();

    await editEncrypted(second.session(conversation), sent["@id"], "after revocation");

    expect(await read(alice, conversation, server.message(sent.id))).toEqual({
      tampered: "sender_not_authorised",
    });
  });

  it("welcome_redirected_to_another_conversation_rejected", async () => {
    const { server, alice, bob } = await setup();
    const real = await createEncryptedConversation(alice, BOB);
    const other = {
      ...server.conversationOf(real.identifier).conversation,
      "@id": "/api/v1/conversations/c999",
      id: 999,
      identifier: "c999",
    } as Conversation;
    server.conversations.set("c999", {
      conversation: other,
      commits: [],
      generation: 1,
      frozen: [],
    });
    server.conversationOf("c999").commits.push(...server.conversationOf(real.identifier).commits);
    for (const welcome of server.welcomes) welcome.conversation = "c999";

    expect(await bob.processWelcomes()).toEqual([]);
    expect(await bob.session(other).status()).toBe("awaiting_welcome");
  });

  it("welcome_with_inflated_epoch_rejected", async () => {
    const { server, alice, bob } = await setup();
    const conversation = await createEncryptedConversation(alice, BOB);
    for (const welcome of server.welcomes) welcome.epoch = 5;

    expect(await bob.processWelcomes()).toEqual([]);
    expect(await bob.session(conversation).status()).toBe("awaiting_welcome");
  });

  it("startup_recovery_never_discards_a_stage_created_meanwhile", async () => {
    const { alice, bob, server } = await setup();
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
      setTimeout(resolve, 50);
    });
    const loadRecords = alice.keyStore.loadRecords.bind(alice.keyStore);
    vi.spyOn(alice.keyStore, "loadRecords").mockImplementationOnce(async (...args) => {
      const records = await loadRecords(...args);
      await gate;
      return records;
    });
    const transport = alice.transport;
    const submit = transport.submitCommit.bind(transport);
    vi.spyOn(transport, "submitCommit").mockImplementation(async (identifier, submission) => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return submit(identifier, submission);
    });

    const recovering = alice.ensureRecovered();
    const conversation = await createEncryptedConversation(alice, BOB);
    await recovering;

    await bob.processWelcomes();
    const sent = await sendEncrypted(alice.session(conversation), "after recovery");
    expect(await read(bob, conversation, server.message(sent.id))).toEqual({
      text: "after recovery",
    });
  });

  it("competing_edits_keep_a_pending_key_each", async () => {
    const { alice, conversation, server } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "v0");
    let secondSealed = () => undefined as void;
    const bothSealed = new Promise<void>((resolve) => (secondSealed = resolve));
    let pendingWrites = 0;
    const putRecords = alice.keyStore.putRecords.bind(alice.keyStore);
    vi.spyOn(alice.keyStore, "putRecords").mockImplementation(async (scope, kind, records) => {
      await putRecords(scope, kind, records);
      if (kind === "pendingKeys" && ++pendingWrites === 2) secondSealed();
    });
    const realCommit = alice.keyStore.commitTransaction.bind(alice.keyStore);
    vi.spyOn(alice.keyStore, "commitTransaction").mockImplementation(async (scope, change) => {
      if (change.messageKeys?.some((m) => m.ref.id === sent.id && m.ref.rev === 1)) {
        throw new Error("crashed");
      }
      return realCommit(scope, change);
    });
    const transport = alice.transport;
    const realEdit = transport.editMessage.bind(transport);
    let winner: Message | null = null;
    vi.spyOn(transport, "editMessage").mockImplementation(async (iri, text, base) => {
      if (winner === null) {
        await bothSealed;
        const accepted = await realEdit(iri, text, base);
        winner = server.message(sent.id);
        return accepted;
      }
      return realEdit(iri, text, base);
    });

    await Promise.allSettled([
      editEncrypted(alice.session(conversation), sent["@id"], "first"),
      editEncrypted(alice.session(conversation), sent["@id"], "second"),
    ]);
    vi.mocked(alice.keyStore.commitTransaction).mockRestore();

    expect(await read(alice, conversation, winner as unknown as Message)).toEqual({
      text: "first",
    });
  });

  it("edit_succeeds_when_a_read_promoted_its_key_first", async () => {
    const { alice, conversation, server } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "v0");
    const transport = alice.transport;
    const realEdit = transport.editMessage.bind(transport);
    vi.spyOn(transport, "editMessage").mockImplementation(async (iri, text, base) => {
      const accepted = await realEdit(iri, text, base);
      expect(await read(alice, conversation, server.message(sent.id))).toEqual({ text: "v1" });
      return accepted;
    });

    const edited = await editEncrypted(alice.session(conversation), sent["@id"], "v1");

    expect(edited.revisionCount).toBe(2);
  });

  it("edit_rebased_when_another_edit_landed_first", async () => {
    const { alice, bob, conversation, server } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "v0");
    const elsewhere = await editEncrypted(alice.session(conversation), sent["@id"], "v1");
    const transport = alice.transport;
    let interfered = false;
    vi.spyOn(transport, "editMessage").mockImplementation(async (iri, text, base) => {
      if (!interfered) {
        interfered = true;
        await server.transportFor(ALICE).editMessage(iri, elsewhere.text as string, base);
      }
      return server.transportFor(ALICE).editMessage(iri, text, base);
    });

    await editEncrypted(alice.session(conversation), sent["@id"], "v2");

    expect(server.message(sent.id).revisionCount).toBe(4);
    expect(await read(bob, conversation, server.message(sent.id))).toEqual({ text: "v2" });
  });

  it("creating_against_existing_group_joins_instead_of_racing", async () => {
    const { alice, bob, server } = await setup();
    const conversation = await createEncryptedConversation(alice, BOB);

    await bob.session(conversation).open();

    expect(server.conversationOf(conversation.identifier).commits).toHaveLength(1);
    expect(await bob.session(conversation).status()).toBe("ready");
  });
});

describe("inner header check", () => {
  it("reparented_reply_shown_as_tampered", async () => {
    const { alice, bob, conversation, server } = await pair();
    const rootA = await sendEncrypted(alice.session(conversation), "root a");
    const rootB = await sendEncrypted(alice.session(conversation), "root b");
    const reply = await sendEncrypted(bob.session(conversation), "reply to a", rootA["@id"]);

    const moved = { ...server.message(reply.id), parent: server.message(rootB.id) };

    expect(await read(alice, conversation, moved)).toEqual({ tampered: "reparented" });
  });

  it("replayed_message_in_other_conversation_shown_as_tampered", async () => {
    const { alice, bob, conversation, server } = await pair();
    await server.addDevice(CAROL);
    const other = await createEncryptedConversation(alice, CAROL);
    const sent = await sendEncrypted(bob.session(conversation), "for alice only");
    expect(await read(alice, conversation, server.message(sent.id))).toEqual({
      text: "for alice only",
    });

    const replayed = { ...server.message(sent.id), conversationIdentifier: other.identifier };

    expect(await read(alice, other, replayed)).toMatchObject({ tampered: expect.any(String) });
  });

  it("replayed_message_under_another_id_shown_as_tampered", async () => {
    const { alice, bob, conversation, server } = await pair();
    const sent = await sendEncrypted(bob.session(conversation), "original");
    const copy = server.message(sent.id);
    const otherId = crypto.randomUUID();

    expect(
      await read(alice, conversation, {
        ...copy,
        id: otherId,
        "@id": `/api/v1/messages/${otherId}`,
      }),
    ).toEqual({ tampered: "replayed" });
  });

  it("replay_under_another_id_does_not_spoil_either_message", async () => {
    const { alice, bob, conversation, server } = await pair();
    const original = await sendEncrypted(bob.session(conversation), "original");
    const victim = await sendEncrypted(bob.session(conversation), "victim");
    const replay = { ...server.message(victim.id), text: server.message(original.id).text };

    expect(await read(alice, conversation, replay)).toEqual({ tampered: "replayed" });
    expect(await read(alice, conversation, replay)).toEqual({ tampered: "replayed" });

    expect(await read(alice, conversation, server.message(original.id))).toEqual({
      text: "original",
    });
    expect(await read(alice, conversation, server.message(victim.id))).toEqual({ text: "victim" });
  });

  it("revision_rollback_shown_as_tampered", async () => {
    const { alice, bob, conversation, server } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "original");
    const original = server.message(sent.id);
    await editEncrypted(alice.session(conversation), sent["@id"], "corrected");

    const rolledBack = { ...server.message(sent.id), text: original.text };

    expect(await read(bob, conversation, rolledBack)).toEqual({ tampered: "revision" });
    expect(await read(alice, conversation, rolledBack)).toEqual({ tampered: "header_mismatch" });
  });

  it("author_substitution_shown_as_tampered", async () => {
    const { alice, bob, conversation, server } = await pair();
    const sent = await sendEncrypted(bob.session(conversation), "from bob");

    const substituted = {
      ...server.message(sent.id),
      createdBy: { ...server.message(sent.id).createdBy, id: CAROL },
    } as Message;

    expect(await read(alice, conversation, substituted)).toEqual({ tampered: "author" });
    expect(await read(alice, conversation, server.message(sent.id))).toEqual({ text: "from bob" });
    expect(await read(alice, conversation, substituted)).toEqual({ tampered: "author" });
  });

  it("plain_text_in_encrypted_conversation_shown_as_tampered", async () => {
    const { alice, conversation, server } = await pair();
    const sent = await sendEncrypted(alice.session(conversation), "real");

    expect(
      await read(alice, conversation, { ...server.message(sent.id), text: "<p>plain</p>" }),
    ).toEqual({ tampered: "malformed" });
  });
});

describe("outgoing requests", () => {
  async function overHttp() {
    const context = await setup();
    const bodies: string[] = [];
    const record = async (request: Request) => {
      const raw = await request.text();
      bodies.push(raw);
      return JSON.parse(raw) as { text: string; id?: string };
    };
    const alice = context.server.transportFor(ALICE);
    mockFetch.use(
      http.post("*/api/v1/conversations/:c/messages", async ({ request, params }) => {
        const body = await record(request);
        return HttpResponse.json(
          await alice.sendMessage(String(params.c), body.text, body.id as string),
          { status: 201 },
        );
      }),
      http.post("*/api/v1/messages/:id/replies", async ({ request, params }) => {
        const body = await record(request);
        return HttpResponse.json(
          await alice.sendReply(String(params.id), body.text, body.id as string),
          { status: 201 },
        );
      }),
      http.patch("*/api/v1/messages/:id", async ({ request, params }) => {
        const body = (await record(request)) as { text: string; baseRevisionCount: number };
        return HttpResponse.json(
          await alice.editMessage(
            `/api/v1/messages/${String(params.id)}`,
            body.text,
            body.baseRevisionCount,
          ),
        );
      }),
      http.get("*/api/v1/messages/:id", async ({ params }) =>
        HttpResponse.json(await alice.fetchMessage(String(params.id))),
      ),
    );
    const identity = identityFor(context.server, ALICE, context.aliceDevice, {
      transport: {
        ...alice,
        sendMessage: httpE2eeTransport.sendMessage,
        sendReply: httpE2eeTransport.sendReply,
        editMessage: httpE2eeTransport.editMessage,
        fetchMessage: httpE2eeTransport.fetchMessage,
      },
    });
    const conversation = await createEncryptedConversation(identity, BOB);
    await context.bob.processWelcomes();
    return { ...context, identity, conversation, bodies };
  }

  function expectOnlyEnvelope(body: string | undefined, plaintext: string) {
    const parsed = JSON.parse(body ?? "{}") as { text: string };
    expect(parsed.text).toMatch(/^e2ee:1:[A-Za-z0-9_-]+$/);
    expect(body).not.toContain(plaintext);
  }

  it("send_body_contains_no_plaintext", async () => {
    const { identity, conversation, bodies, bob, server } = await overHttp();

    const sent = await sendEncrypted(identity.session(conversation), "secret root text");

    expect(bodies).toHaveLength(1);
    expectOnlyEnvelope(bodies[0], "secret root text");
    expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({ id: sent.id });
    expect(await read(bob, conversation, server.message(sent.id))).toEqual({
      text: "secret root text",
    });
  });

  it("reply_body_contains_no_plaintext", async () => {
    const { identity, conversation, bodies } = await overHttp();
    const root = await sendEncrypted(identity.session(conversation), "root");

    await sendEncrypted(identity.session(conversation), "secret reply text", root["@id"]);

    expect(bodies).toHaveLength(2);
    expectOnlyEnvelope(bodies[1], "secret reply text");
  });

  it("edit_body_contains_no_plaintext", async () => {
    const { identity, conversation, bodies, bob, server } = await overHttp();
    const sent = await sendEncrypted(identity.session(conversation), "before");

    await editEncrypted(identity.session(conversation), sent["@id"], "secret edited text");

    expect(bodies).toHaveLength(2);
    expectOnlyEnvelope(bodies[1], "secret edited text");
    expect(await read(bob, conversation, server.message(sent.id))).toEqual({
      text: "secret edited text",
    });
  });
});

async function groupIdOf(identity: E2eeIdentity, conversation: Conversation): Promise<string> {
  const record = await identity.keyStore.getRecord(
    identity.scope,
    "groups",
    conversation.identifier,
  );
  const progress = JSON.parse(new TextDecoder().decode(record as Uint8Array)) as {
    groupId: string;
  };
  return progress.groupId;
}

async function groupInfoOf(
  engine: FakeDevice["engine"],
  conversation: Conversation,
): Promise<Uint8Array> {
  const state = JSON.parse(new TextDecoder().decode(engine.latest())) as {
    groups: Record<string, { epoch: number; members: unknown[] }>;
  };
  const [groupId, group] = Object.entries(state.groups).find(([id]) =>
    id.startsWith(`${conversation.id}.`),
  ) as [string, { epoch: number; members: unknown[] }];
  return new TextEncoder().encode(JSON.stringify({ groupId, ...group }));
}

async function submitStaged(
  server: FakeDeliveryServer,
  userId: number,
  device: FakeDevice,
  conversation: Conversation,
  staged: Awaited<ReturnType<MlsEngine["addMembers"]>>,
) {
  await server.submitRaw(userId, conversation.identifier, {
    commitId: crypto.randomUUID(),
    deviceId: device.credential.deviceId,
    epoch: server.conversationOf(conversation.identifier).commits.length + 1,
    generation: 1,
    commit: staged.commit as Uint8Array,
    groupInfo: staged.groupInfo as Uint8Array,
    welcomes: [],
  });
}

async function resetBob(server: FakeDeliveryServer, conversation: Conversation) {
  const bob = server.users.get(BOB);
  if (bob === undefined) throw new Error("no bob");
  bob.account = await ed25519Key();
  bob.generation = 2;
  const device = await server.addDevice(BOB, { generation: 2 });
  const identity = identityFor(server, BOB, device);
  const groupId = `${conversation.id}.reset`;
  const created = await device.engine.createGroup(device.engine.latest(), groupId);
  await device.engine.merge(created);
  const staged = await device.engine.addMembers(device.engine.latest(), groupId, []);
  await device.engine.merge(staged);
  await server.submitRaw(BOB, conversation.identifier, {
    commitId: crypto.randomUUID(),
    deviceId: device.credential.deviceId,
    epoch: server.conversationOf(conversation.identifier).commits.length + 1,
    generation: 2,
    commit: staged.commit as Uint8Array,
    groupInfo: staged.groupInfo as Uint8Array,
    welcomes: [],
  });
  return {
    identity,
    async sendRaw(text: string): Promise<Message> {
      const { encodeEnvelope, encodeKeyMessage, sealContent } = await import("@/e2ee/envelope");
      const id = crypto.randomUUID();
      const header = {
        id,
        rev: 0,
        parent: null,
        conv: conversation.id,
        g: 2,
        sender: await identity.sender(),
      };
      const sealed = await sealContent(header, text);
      const { message } = await device.engine.encrypt(
        device.engine.latest(),
        groupId,
        encodeKeyMessage(sealed.key, header),
      );
      const envelope = encodeEnvelope({ g: 2, n: sealed.nonce, c: sealed.ciphertext, m: message });
      return server.transportFor(BOB).sendMessage(conversation.identifier, envelope, id);
    },
  };
}
