import { uploadEncryptedConversationAttachment } from "@/api/attachments";
import { uuidFromIri } from "@/api/hydra";
import type { CborValue } from "./canonicalCbor";

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const ASSOCIATED_DATA = new TextEncoder().encode("tyto-attachment-v1");

export interface AttachmentManifest {
  name: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
}

export interface EncryptedFile {
  blob: Blob;
  key: Uint8Array;
  nonce: Uint8Array;
  manifest: AttachmentManifest;
}

export interface AttachmentKey {
  id: string;
  key: Uint8Array;
  nonce: Uint8Array;
  manifest: AttachmentManifest;
}

export interface UploadedEncryptedAttachment extends AttachmentKey {
  iri: string;
}

export class AttachmentTooLargeError extends Error {
  constructor() {
    super("the file is larger than the server accepts");
    this.name = "AttachmentTooLargeError";
  }
}

export class AttachmentTamperedError extends Error {
  constructor() {
    super("the attachment was changed after it was encrypted");
    this.name = "AttachmentTamperedError";
  }
}

export class AttachmentKeyMissingError extends Error {
  constructor() {
    super("the key of an attachment was lost before sending");
    this.name = "AttachmentKeyMissingError";
  }
}

const uploads = new Map<string, UploadedEncryptedAttachment>();

export function forgetUploadedAttachments(iris: readonly string[]): void {
  for (const iri of iris) uploads.delete(iri);
}

export function uploadedAttachmentsFor(iris: readonly string[]): UploadedEncryptedAttachment[] {
  return iris.map((iri) => {
    const upload = uploads.get(iri);
    if (upload === undefined) throw new AttachmentKeyMissingError();
    return upload;
  });
}

async function aesKey(raw: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array(raw), "AES-GCM", false, [usage]);
}

async function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

async function manifestOf(file: Blob): Promise<AttachmentManifest> {
  const manifest: AttachmentManifest = {
    name: file instanceof File && file.name !== "" ? file.name : "attachment",
    mimeType: file.type === "" ? "application/octet-stream" : file.type,
    size: file.size,
  };
  const dimensions = await imageSize(file);
  if (dimensions !== null) {
    manifest.width = dimensions.width;
    manifest.height = dimensions.height;
  }
  return manifest;
}

export async function encryptFile(file: Blob, maxBytes = Infinity): Promise<EncryptedFile> {
  if (file.size > maxBytes) throw new AttachmentTooLargeError();
  const key = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: ASSOCIATED_DATA },
    await aesKey(key, "encrypt"),
    await file.arrayBuffer(),
  );
  return {
    blob: new Blob([ciphertext], { type: "application/octet-stream" }),
    key,
    nonce,
    manifest: await manifestOf(file),
  };
}

export async function decryptFile(blob: Blob, key: Uint8Array, nonce: Uint8Array): Promise<Blob> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(nonce), additionalData: ASSOCIATED_DATA },
      await aesKey(key, "decrypt"),
      await blob.arrayBuffer(),
    );
    return new Blob([plain]);
  } catch {
    throw new AttachmentTamperedError();
  }
}

export async function uploadEncryptedAttachment(
  conversationIdentifier: string,
  file: File,
  maxBytes: number,
  onProgress?: (percent: number) => void,
): Promise<UploadedEncryptedAttachment> {
  const encrypted = await encryptFile(file, maxBytes);
  const uploaded = await uploadEncryptedConversationAttachment(
    conversationIdentifier,
    encrypted.blob,
    onProgress,
  );
  const upload = {
    iri: uploaded["@id"],
    id: uuidFromIri(uploaded["@id"]),
    key: encrypted.key,
    nonce: encrypted.nonce,
    manifest: encrypted.manifest,
  };
  uploads.set(upload.iri, upload);
  return upload;
}

export function encodeAttachmentKeys(keys: readonly AttachmentKey[]): CborValue[] {
  return keys.map((k) => {
    const manifest: Record<string, CborValue> = {
      name: k.manifest.name,
      mimeType: k.manifest.mimeType,
      size: k.manifest.size,
    };
    if (k.manifest.width !== undefined) manifest.width = k.manifest.width;
    if (k.manifest.height !== undefined) manifest.height = k.manifest.height;
    return { id: k.id, key: k.key, nonce: k.nonce, manifest };
  });
}

function isMap(value: CborValue | undefined): value is Record<string, CborValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value)
  );
}

function isCount(value: CborValue | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function readManifest(value: CborValue | undefined): AttachmentManifest | null {
  if (!isMap(value)) return null;
  const keys = Object.keys(value);
  const allowed = ["name", "mimeType", "size", "width", "height"];
  if (keys.some((k) => !allowed.includes(k))) return null;
  const { name, mimeType, size, width, height } = value;
  if (typeof name !== "string" || typeof mimeType !== "string" || !isCount(size)) return null;
  if ((width === undefined) !== (height === undefined)) return null;
  const manifest: AttachmentManifest = { name, mimeType, size };
  if (width !== undefined) {
    if (!isCount(width) || !isCount(height)) return null;
    manifest.width = width;
    manifest.height = height;
  }
  return manifest;
}

export function decodeAttachmentKeys(values: readonly CborValue[]): AttachmentKey[] | null {
  const keys: AttachmentKey[] = [];
  for (const value of values) {
    if (!isMap(value) || Object.keys(value).sort().join() !== "id,key,manifest,nonce") return null;
    const { id, key, nonce } = value;
    const manifest = readManifest(value.manifest);
    if (
      typeof id !== "string" ||
      id === "" ||
      !ArrayBuffer.isView(key) ||
      key.length !== KEY_BYTES ||
      !ArrayBuffer.isView(nonce) ||
      nonce.length !== NONCE_BYTES ||
      manifest === null ||
      keys.some((k) => k.id === id)
    ) {
      return null;
    }
    keys.push({ id, key, nonce, manifest });
  }
  return keys;
}
