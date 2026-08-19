export const OPTIMISTIC_IRI_PREFIX = "optimistic-";

export function isOptimisticMessage(iri: string | undefined | null): boolean {
  return !!iri && iri.startsWith(OPTIMISTIC_IRI_PREFIX);
}
