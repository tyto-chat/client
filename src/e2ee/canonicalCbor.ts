export type CborValue = string | number | Uint8Array;

function head(major: number, length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new Error("CBOR values must be non-negative integers");
  }
  const type = major << 5;
  if (length < 24) return Uint8Array.of(type | length);
  if (length < 0x100) return Uint8Array.of(type | 24, length);
  const size = length < 0x10000 ? 2 : length < 0x100000000 ? 4 : 8;
  const out = new Uint8Array(1 + size);
  out[0] = type | (size === 2 ? 25 : size === 4 ? 26 : 27);
  let rest = BigInt(length);
  for (let i = size; i >= 1; i--) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function encodeValue(value: CborValue): Uint8Array {
  if (typeof value === "number") return head(0, value);
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return concat([head(typeof value === "string" ? 3 : 2, bytes.length), bytes]);
}

export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}

export function encodeCanonicalMap(map: Record<string, CborValue>): Uint8Array {
  const entries = Object.entries(map).map(([key, value]) => [encodeValue(key), encodeValue(value)]);
  entries.sort(([a], [b]) => compareBytes(a ?? new Uint8Array(), b ?? new Uint8Array()));
  return concat([head(5, entries.length), ...entries.flat()]);
}
