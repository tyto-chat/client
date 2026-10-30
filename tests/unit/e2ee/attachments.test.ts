import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import {
  AttachmentTamperedError,
  AttachmentTooLargeError,
  decryptFile,
  encryptFile,
  uploadEncryptedAttachment,
  type UploadedEncryptedAttachment,
} from "@/e2ee/attachments";
import {
  createEncryptedConversation,
  decryptMessage,
  editEncrypted,
  sendEncrypted,
  type DecryptResult,
} from "@/e2ee/conversationSession";
import type { MlsEngine } from "@/e2ee/engine";
import { FakeDeliveryServer } from "../../mocks/fakeDeliveryServer";
import { identityFor } from "../../mocks/e2eeIdentity";
import { server as mockFetch } from "../../mocks/server";
import { TEST_BASE_URL as BASE } from "../../fixtures";

const ALICE = 1;
const BOB = 2;

async function pair() {
  const server = new FakeDeliveryServer();
  const aliceDevice = await server.addDevice(ALICE);
  const bobDevice = await server.addDevice(BOB);
  const alice = identityFor(server, ALICE, aliceDevice);
  const bob = identityFor(server, BOB, bobDevice);
  const conversation = await createEncryptedConversation(alice, BOB);
  await bob.processWelcomes();
  return { server, alice, bob, bobDevice, conversation };
}

async function upload(
  server: FakeDeliveryServer,
  file: File,
): Promise<UploadedEncryptedAttachment> {
  const encrypted = await encryptFile(file);
  const stored = server.storeAttachment(encrypted.blob);
  return {
    iri: stored["@id"],
    id: stored["@id"].slice(stored["@id"].lastIndexOf("/") + 1),
    key: encrypted.key,
    nonce: encrypted.nonce,
    manifest: encrypted.manifest,
  };
}

async function openFirst(server: FakeDeliveryServer, result: DecryptResult): Promise<string> {
  if (!("text" in result) || result.attachments === undefined) throw new Error("no attachments");
  const [ref] = result.attachments;
  if (ref === undefined) throw new Error("no attachment");
  const [stored] = server.attachments.values();
  const plain = await decryptFile(
    server.attachmentBlob(stored!.attachment.contentUrl as string),
    ref.key,
    ref.nonce,
  );
  return plain.text();
}

afterEach(() => vi.unstubAllGlobals());

describe("encrypted attachments", () => {
  it("file_roundtrip", async () => {
    const { server, alice, bob, conversation } = await pair();
    const ref = await upload(
      server,
      new File(["secret notes"], "notes.txt", { type: "text/plain" }),
    );

    const sent = await sendEncrypted(alice.session(conversation), "see file", undefined, [ref]);

    expect(server.message(sent.id).attachments?.map((a) => a["@id"])).toEqual([ref.iri]);
    const result = await decryptMessage(bob.session(conversation), server.message(sent.id));
    expect(result).toMatchObject({ text: "see file" });
    expect("text" in result && result.attachments?.[0]?.manifest).toEqual({
      name: "notes.txt",
      mimeType: "text/plain",
      size: 12,
    });
    expect(await openFirst(server, result)).toBe("secret notes");
  });

  it("file_roundtrip_in_thread_reply", async () => {
    const { server, alice, bob, conversation } = await pair();
    const root = await sendEncrypted(alice.session(conversation), "root");
    const ref = await upload(server, new File(["reply file"], "r.txt", { type: "text/plain" }));

    const reply = await sendEncrypted(bob.session(conversation), "in thread", root["@id"], [ref]);

    expect(server.message(reply.id).parent?.id).toBe(root.id);
    const result = await decryptMessage(alice.session(conversation), server.message(reply.id));
    expect(await openFirst(server, result)).toBe("reply file");
  });

  it("edit_keeps_attachment_keys", async () => {
    const { server, alice, bob, conversation } = await pair();
    const ref = await upload(server, new File(["kept"], "k.txt", { type: "text/plain" }));
    const sent = await sendEncrypted(alice.session(conversation), "first", undefined, [ref]);

    await editEncrypted(alice.session(conversation), sent["@id"], "second");

    const result = await decryptMessage(bob.session(conversation), server.message(sent.id));
    expect(result).toMatchObject({ text: "second" });
    expect(await openFirst(server, result)).toBe("kept");
  });

  it("file_recoverable_from_content_key_alone_after_mls_state_discarded", async () => {
    const { server, alice, bob, bobDevice, conversation } = await pair();
    const ref = await upload(server, new File(["after restore"], "a.txt", { type: "text/plain" }));
    const sent = await sendEncrypted(alice.session(conversation), "hi", undefined, [ref]);
    await decryptMessage(bob.session(conversation), server.message(sent.id));

    const noMls = {
      ...bobDevice.engine,
      decrypt: () => Promise.reject(new Error("MLS state discarded")),
    } as MlsEngine;
    const restored = identityFor(server, BOB, bobDevice, { keyStore: bob.keyStore, engine: noMls });
    const result = await decryptMessage(restored.session(conversation), server.message(sent.id));

    expect(await openFirst(server, result)).toBe("after restore");
  });

  it("tampered_blob_fails_decrypt", async () => {
    const encrypted = await encryptFile(new File(["untouched"], "t.txt"));
    const bytes = new Uint8Array(await encrypted.blob.arrayBuffer());
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;

    await expect(decryptFile(new Blob([bytes]), encrypted.key, encrypted.nonce)).rejects.toThrow(
      AttachmentTamperedError,
    );
  });

  it("manifest_carries_name_mime_dimensions_and_upload_has_opaque_name", async () => {
    configureApiClient(BASE);
    setAccessToken("jwt");
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve({ width: 640, height: 480, close: () => undefined })),
    );
    let uploadedName = "";
    let uploadedType = "";
    let uploadedBytes = new Uint8Array();
    mockFetch.use(
      http.post(`${BASE}/api/v1/conversations/c9/encrypted-attachments`, async ({ request }) => {
        const file = (await request.formData()).get("file") as File;
        uploadedName = file.name;
        uploadedType = file.type;
        uploadedBytes = new Uint8Array(await file.arrayBuffer());
        return HttpResponse.json(
          { "@id": "/api/v1/attachments/77", type: "encrypted_attachment", size: file.size },
          { status: 201 },
        );
      }),
    );
    const photo = new File([new Uint8Array(100).fill(7)], "holiday.png", { type: "image/png" });

    const uploaded = await uploadEncryptedAttachment("c9", photo, 1024);

    expect(uploaded.manifest).toEqual({
      name: "holiday.png",
      mimeType: "image/png",
      size: 100,
      width: 640,
      height: 480,
    });
    expect(uploaded.iri).toBe("/api/v1/attachments/77");
    expect(uploaded.id).toBe("77");
    expect(uploadedName).toMatch(/^[0-9a-f-]{36}\.bin$/);
    expect(uploadedType).toBe("application/octet-stream");
    expect(new TextDecoder().decode(uploadedBytes)).not.toContain("holiday");
    expect(uploadedBytes.some((byte) => byte !== 7)).toBe(true);
  });

  it("plaintext_over_cap_refused_before_upload", async () => {
    configureApiClient(BASE);
    setAccessToken("jwt");
    const handler = vi.fn(() => HttpResponse.json({}, { status: 201 }));
    mockFetch.use(http.post(`${BASE}/api/v1/conversations/c9/encrypted-attachments`, handler));

    await expect(
      uploadEncryptedAttachment("c9", new File([new Uint8Array(1025)], "big.bin"), 1024),
    ).rejects.toThrow(AttachmentTooLargeError);
    expect(handler).not.toHaveBeenCalled();
  });
});
