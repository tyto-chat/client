import { decodeCbor, encodeCanonicalMap, type CborValue } from "./canonicalCbor";
import type { MessageKeySender } from "./keyStore";

export const ENVELOPE_PREFIX = "e2ee:1:";
export const MAX_ENVELOPE_BYTES = 65_536;
export const MAX_PLAINTEXT_CHARS = 10_000;

const KEY_BYTES = 32;
const NONCE_BYTES = 12;

export interface MessageHeader {
  id: string;
  rev: number;
  parent: string | null;
  conv: number;
  g: number;
  sender: MessageKeySender;
}

export interface Envelope {
  g: number;
  n: Uint8Array;
  c: Uint8Array;
  m: Uint8Array;
}

export interface SealedContent {
  key: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

export interface ContentPayload {
  h: MessageHeader;
  t: string;
  a: CborValue[];
}

export class PlaintextTooLongError extends Error {
  constructor() {
    super("the message is longer than 10,000 characters");
    this.name = "PlaintextTooLongError";
  }
}

export class EnvelopeTooLargeError extends Error {
  constructor() {
    super("the encrypted message is larger than the server accepts");
    this.name = "EnvelopeTooLargeError";
  }
}

export function assertPlaintextLength(text: string): void {
  if (Array.from(text).length > MAX_PLAINTEXT_CHARS) throw new PlaintextTooLongError();
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("not base64url");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
}

export async function accountKeyFingerprint(accountPublicKey: Uint8Array): Promise<string> {
  return toBase64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(accountPublicKey))),
  );
}

function headerMap(header: MessageHeader): Record<string, CborValue> {
  return {
    id: header.id,
    rev: header.rev,
    parent: header.parent,
    conv: header.conv,
    g: header.g,
    sender: {
      userId: header.sender.userId,
      accountKeyFingerprint: header.sender.accountKeyFingerprint,
      deviceId: header.sender.deviceId,
    },
  };
}

export function encodeHeader(header: MessageHeader): Uint8Array {
  return encodeCanonicalMap(headerMap(header));
}

function isMap(value: CborValue | undefined): value is Record<string, CborValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value)
  );
}

function hasExactly(map: Record<string, CborValue>, keys: string[]): boolean {
  const present = Object.keys(map).sort();
  return present.length === keys.length && [...keys].sort().every((k, i) => k === present[i]);
}

function readHeader(value: CborValue | undefined): MessageHeader {
  if (!isMap(value) || !hasExactly(value, ["id", "rev", "parent", "conv", "g", "sender"])) {
    throw new Error("malformed message header");
  }
  const { id, rev, parent, conv, g, sender } = value;
  if (
    typeof id !== "string" ||
    typeof rev !== "number" ||
    (parent !== null && typeof parent !== "string") ||
    typeof conv !== "number" ||
    typeof g !== "number" ||
    !isMap(sender) ||
    !hasExactly(sender, ["userId", "accountKeyFingerprint", "deviceId"]) ||
    typeof sender.userId !== "number" ||
    typeof sender.accountKeyFingerprint !== "string" ||
    typeof sender.deviceId !== "string"
  ) {
    throw new Error("malformed message header");
  }
  return {
    id,
    rev,
    parent,
    conv,
    g,
    sender: {
      userId: sender.userId,
      accountKeyFingerprint: sender.accountKeyFingerprint,
      deviceId: sender.deviceId,
    },
  };
}

export function sameHeader(a: MessageHeader, b: MessageHeader): boolean {
  const left = encodeHeader(a);
  const right = encodeHeader(b);
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}

async function contentKey(raw: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array(raw), "AES-GCM", false, [usage]);
}

export async function sealContent(header: MessageHeader, text: string): Promise<SealedContent> {
  const key = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const payload = encodeCanonicalMap({ h: headerMap(header), t: text, a: [] });
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: new Uint8Array(encodeHeader(header)) },
      await contentKey(key, "encrypt"),
      new Uint8Array(payload),
    ),
  );
  return { key, nonce, ciphertext };
}

export async function openContent(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  header: MessageHeader,
): Promise<ContentPayload | null> {
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(nonce),
          additionalData: new Uint8Array(encodeHeader(header)),
        },
        await contentKey(key, "decrypt"),
        new Uint8Array(ciphertext),
      ),
    );
  } catch {
    return null;
  }
  try {
    const payload = decodeCbor(plain);
    if (
      !isMap(payload) ||
      !hasExactly(payload, ["h", "t", "a"]) ||
      typeof payload.t !== "string" ||
      !Array.isArray(payload.a)
    ) {
      return null;
    }
    return { h: readHeader(payload.h), t: payload.t, a: payload.a };
  } catch {
    return null;
  }
}

export function encodeKeyMessage(key: Uint8Array, header: MessageHeader): Uint8Array {
  return encodeCanonicalMap({ k: key, h: headerMap(header) });
}

export function decodeKeyMessage(bytes: Uint8Array): { key: Uint8Array; header: MessageHeader } {
  const value = decodeCbor(bytes);
  if (!isMap(value) || !hasExactly(value, ["k", "h"]) || !ArrayBuffer.isView(value.k)) {
    throw new Error("malformed key message");
  }
  if (value.k.length !== KEY_BYTES) throw new Error("malformed key message");
  return { key: value.k, header: readHeader(value.h) };
}

export function encodeEnvelope(envelope: Envelope): string {
  const json = JSON.stringify({
    g: envelope.g,
    n: toBase64Url(envelope.n),
    c: toBase64Url(envelope.c),
    m: toBase64Url(envelope.m),
  });
  const text = ENVELOPE_PREFIX + toBase64Url(new TextEncoder().encode(json));
  if (new TextEncoder().encode(text).length > MAX_ENVELOPE_BYTES) throw new EnvelopeTooLargeError();
  return text;
}

export function decodeEnvelope(text: string | null | undefined): Envelope | null {
  if (typeof text !== "string" || !text.startsWith(ENVELOPE_PREFIX)) return null;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      fromBase64Url(text.slice(ENVELOPE_PREFIX.length)),
    );
    const fields = JSON.parse(json) as Record<string, unknown>;
    const keys = Object.keys(fields).sort();
    if (keys.join(",") !== "c,g,m,n") return null;
    const { g, n, c, m } = fields;
    if (typeof g !== "number" || !Number.isSafeInteger(g) || g < 0) return null;
    if (typeof n !== "string" || typeof c !== "string" || typeof m !== "string") return null;
    const nonce = fromBase64Url(n);
    if (nonce.length !== NONCE_BYTES || c === "" || m === "") return null;
    return { g, n: nonce, c: fromBase64Url(c), m: fromBase64Url(m) };
  } catch {
    return null;
  }
}
