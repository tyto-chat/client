export type CborValue =
  string | number | Uint8Array | null | CborValue[] | { [key: string]: CborValue };

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

const NULL = 0xf6;

function encodeValue(value: CborValue): Uint8Array {
  if (value === null) return Uint8Array.of(NULL);
  if (typeof value === "number") return head(0, value);
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return concat([head(3, bytes.length), bytes]);
  }
  if (ArrayBuffer.isView(value)) return concat([head(2, value.length), value]);
  if (Array.isArray(value)) return concat([head(4, value.length), ...value.map(encodeValue)]);
  return encodeCanonicalMap(value);
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

const MAX_DEPTH = 8;

class Reader {
  private offset = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  done(): boolean {
    return this.offset === this.bytes.length;
  }

  value(depth = 0): CborValue {
    if (depth > MAX_DEPTH) throw new Error("CBOR value is nested too deeply");
    const initial = this.byte();
    if (initial === NULL) return null;
    const major = initial >> 5;
    const length = this.length(initial & 0x1f);
    switch (major) {
      case 0:
        return length;
      case 2:
        return this.take(length).slice();
      case 3:
        return new TextDecoder("utf-8", { fatal: true }).decode(this.take(length));
      case 4: {
        this.requireRoom(length);
        const items: CborValue[] = [];
        for (let i = 0; i < length; i++) items.push(this.value(depth + 1));
        return items;
      }
      case 5: {
        this.requireRoom(length * 2);
        const map: Record<string, CborValue> = {};
        for (let i = 0; i < length; i++) {
          const key = this.value(depth + 1);
          if (typeof key !== "string" || Object.hasOwn(map, key)) {
            throw new Error("CBOR map keys must be distinct strings");
          }
          map[key] = this.value(depth + 1);
        }
        return map;
      }
      default:
        throw new Error("unsupported CBOR value");
    }
  }

  private requireRoom(minimumBytes: number): void {
    if (minimumBytes > this.bytes.length - this.offset) throw new Error("truncated CBOR value");
  }

  private byte(): number {
    const value = this.bytes[this.offset];
    if (value === undefined) throw new Error("truncated CBOR value");
    this.offset += 1;
    return value;
  }

  private take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new Error("truncated CBOR value");
    const out = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  private length(info: number): number {
    if (info < 24) return info;
    const size = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
    if (size === 0) throw new Error("unsupported CBOR length");
    let value = 0n;
    for (const byte of this.take(size)) value = (value << 8n) | BigInt(byte);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR integer is too large");
    return Number(value);
  }
}

export function decodeCbor(bytes: Uint8Array): CborValue {
  const reader = new Reader(bytes);
  const value = reader.value();
  if (!reader.done()) throw new Error("trailing bytes after CBOR value");
  return value;
}
