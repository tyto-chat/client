import { describe, expect, it, vi } from "vitest";
import { decodeCbor, encodeCanonicalMap } from "@/e2ee/canonicalCbor";
import {
  assertPlaintextLength,
  decodeEnvelope,
  decodeKeyMessage,
  encodeEnvelope,
  encodeHeader,
  encodeKeyMessage,
  EnvelopeTooLargeError,
  fromBase64Url,
  openContent,
  PlaintextTooLongError,
  sealContent,
  toBase64Url,
  type MessageHeader,
} from "@/e2ee/envelope";

const header: MessageHeader = {
  id: "0b6c7d2e-9f1a-4c3b-8d5e-6f7a8b9c0d1e",
  rev: 0,
  parent: null,
  conv: 42,
  g: 1,
  sender: { userId: 7, accountKeyFingerprint: "fp", deviceId: "d1" },
};

function envelopeText(fields: Record<string, unknown>): string {
  return `e2ee:1:${toBase64Url(new TextEncoder().encode(JSON.stringify(fields)))}`;
}

describe("envelope", () => {
  it("roundtrips through the wire format the server validates", async () => {
    const sealed = await sealContent(header, "hello");
    const text = encodeEnvelope({
      g: 1,
      n: sealed.nonce,
      c: sealed.ciphertext,
      m: Uint8Array.of(1, 2),
    });

    expect(text).toMatch(/^e2ee:1:[A-Za-z0-9_-]+$/);
    const json = JSON.parse(new TextDecoder().decode(fromBase64Url(text.slice(7)))) as Record<
      string,
      unknown
    >;
    expect(Object.keys(json).sort()).toEqual(["c", "g", "m", "n"]);
    const decoded = decodeEnvelope(text);
    expect(decoded?.g).toBe(1);
    expect(decoded?.n).toEqual(sealed.nonce);
    expect(decoded?.c).toEqual(sealed.ciphertext);
    expect(decoded?.m).toEqual(Uint8Array.of(1, 2));
  });

  it("rejects anything that is not a well-formed envelope", () => {
    const nonce = toBase64Url(new Uint8Array(12));
    expect(decodeEnvelope("<p>plain</p>")).toBeNull();
    expect(decodeEnvelope(null)).toBeNull();
    expect(decodeEnvelope("e2ee:1:!!!")).toBeNull();
    expect(
      decodeEnvelope(envelopeText({ g: 1, n: nonce, c: "AQ", m: "AQ", t: "leak" })),
    ).toBeNull();
    expect(decodeEnvelope(envelopeText({ g: -1, n: nonce, c: "AQ", m: "AQ" }))).toBeNull();
    expect(decodeEnvelope(envelopeText({ g: 1, n: "AQ", c: "AQ", m: "AQ" }))).toBeNull();
    expect(decodeEnvelope(envelopeText({ g: 1, n: nonce, c: "", m: "AQ" }))).toBeNull();
  });

  it("refuses an envelope above the server's 64 KiB limit", () => {
    expect(() =>
      encodeEnvelope({
        g: 1,
        n: new Uint8Array(12),
        c: new Uint8Array(50_000),
        m: Uint8Array.of(1),
      }),
    ).toThrow(EnvelopeTooLargeError);
  });

  it("counts the plaintext limit in characters, not bytes", () => {
    expect(() => assertPlaintextLength("é".repeat(10_000))).not.toThrow();
    expect(() => assertPlaintextLength("😀".repeat(10_000))).not.toThrow();
    expect(() => assertPlaintextLength("a".repeat(10_001))).toThrow(PlaintextTooLongError);
  });

  it("binds the header to the content as associated data", async () => {
    const sealed = await sealContent(header, "bound");

    const opened = await openContent(sealed.key, sealed.nonce, sealed.ciphertext, header);
    const moved = await openContent(sealed.key, sealed.nonce, sealed.ciphertext, {
      ...header,
      parent: "11111111-1111-4111-8111-111111111111",
    });

    expect(opened).toEqual({ h: header, t: "bound", a: [] });
    expect(moved).toBeNull();
  });

  it("uses a fresh content key for every message", async () => {
    const one = await sealContent(header, "same");
    const two = await sealContent(header, "same");

    expect(one.key).not.toEqual(two.key);
    expect(one.ciphertext).not.toEqual(two.ciphertext);
  });

  it("encodes the header deterministically", () => {
    const reordered: MessageHeader = {
      sender: { deviceId: "d1", accountKeyFingerprint: "fp", userId: 7 },
      g: 1,
      conv: 42,
      parent: null,
      rev: 0,
      id: header.id,
    };

    expect(encodeHeader(reordered)).toEqual(encodeHeader(header));
  });

  it("carries the content key and header in the MLS message", () => {
    const key = crypto.getRandomValues(new Uint8Array(32));

    expect(decodeKeyMessage(encodeKeyMessage(key, header))).toEqual({ key, header });
    expect(() => decodeKeyMessage(encodeCanonicalMap({ k: Uint8Array.of(1), h: "x" }))).toThrow();
  });
});

describe("canonical CBOR decoding", () => {
  it("roundtrips nested maps, arrays, null, text, bytes and integers", () => {
    const value = { a: [1, "two", Uint8Array.of(3)], b: null, c: { d: 70_000 } };

    expect(decodeCbor(encodeCanonicalMap(value))).toEqual(value);
  });

  it("refuses collection lengths larger than the input before allocating", () => {
    const hugeArray = Uint8Array.of(0x9a, 0x00, 0x98, 0x96, 0x80);
    const hugeMap = Uint8Array.of(0xba, 0x00, 0x98, 0x96, 0x80);
    const allocate = vi.spyOn(Array, "from");

    expect(() => decodeCbor(hugeArray)).toThrow();
    expect(() => decodeCbor(hugeMap)).toThrow();
    expect(allocate).not.toHaveBeenCalled();
  });

  it("rejects trailing bytes, duplicate keys and truncation", () => {
    const encoded = encodeCanonicalMap({ a: 1 });

    expect(() => decodeCbor(Uint8Array.of(...encoded, 0))).toThrow();
    expect(() => decodeCbor(Uint8Array.of(0xa2, 0x61, 0x61, 0x01, 0x61, 0x61, 0x02))).toThrow();
    expect(() => decodeCbor(encoded.subarray(0, encoded.length - 1))).toThrow();
  });
});
