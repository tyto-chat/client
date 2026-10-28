import { compareBytes } from "./canonicalCbor";

const DOMAIN = new TextEncoder().encode("tyto safety number v1");
const GROUPS = 12;
const DIGITS = 5;

export async function safetyNumber(
  accountPublicA: Uint8Array,
  accountPublicB: Uint8Array,
): Promise<string> {
  const [first, second] = [accountPublicA, accountPublicB].sort(compareBytes) as [
    Uint8Array,
    Uint8Array,
  ];
  const input = new Uint8Array(DOMAIN.length + 2 + first.length + 2 + second.length);
  let offset = 0;
  for (const part of [DOMAIN, first, second]) {
    if (part !== DOMAIN) {
      input[offset++] = part.length >> 8;
      input[offset++] = part.length & 0xff;
    }
    input.set(part, offset);
    offset += part.length;
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  let value = 0n;
  for (const byte of digest) value = (value << 8n) | BigInt(byte);
  const digits = (value % 10n ** BigInt(GROUPS * DIGITS)).toString().padStart(GROUPS * DIGITS, "0");
  return Array.from({ length: GROUPS }, (_, i) => digits.slice(i * DIGITS, (i + 1) * DIGITS)).join(
    " ",
  );
}
