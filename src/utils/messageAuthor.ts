import type { Message } from "@/types/api";

export function findMessageAuthorId(
  iri: string | null,
  ...lists: ReadonlyArray<readonly Message[] | undefined>
): number | undefined {
  if (!iri) return undefined;
  for (const list of lists) {
    const found = list?.find((m) => m["@id"] === iri);
    if (found) return found.createdBy?.id;
  }
  return undefined;
}
