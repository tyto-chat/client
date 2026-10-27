import { describe, it, expect } from "vitest";
import { findMessageAuthorId } from "@/utils/messageAuthor";
import type { Message } from "@/types/api";

const msg = (iri: string, id: number) => ({ "@id": iri, createdBy: { id } }) as unknown as Message;

describe("findMessageAuthorId", () => {
  it("finds a timeline message author", () => {
    expect(findMessageAuthorId("/m/1", [msg("/m/1", 5)], [])).toBe(5);
  });

  it("falls back to thread replies for a reply author", () => {
    expect(findMessageAuthorId("/m/9", [msg("/m/1", 5)], [msg("/m/9", 7)])).toBe(7);
  });

  it("is undefined when absent or iri is null", () => {
    expect(findMessageAuthorId("/m/9", [msg("/m/1", 5)], undefined)).toBeUndefined();
    expect(findMessageAuthorId(null, [msg("/m/1", 5)])).toBeUndefined();
  });
});
