import { getApiVersion } from "@/api/apiVersion";
import type { HydraCollection } from "@/types/api";

export function unwrapCollection<T>(collection: HydraCollection<T> | T[]): T[] {
  if (Array.isArray(collection)) return collection;
  return collection["hydra:member"] ?? [];
}

export function iriToId(iri: string): number {
  return parseInt(iri.split("/").at(-1) ?? "", 10);
}

export function uuidFromIri(iri: string): string {
  return iri.split("/").filter(Boolean).pop() ?? "";
}

export function toIri(resource: string, id: number | string): string {
  return `/api/${getApiVersion()}/${resource}/${id}`;
}

// Sections are nested under their community; a flat /sections/{id} IRI no longer resolves.
export function sectionIri(communityId: string, sectionId: number): string {
  return `${toIri("communities", communityId)}/sections/${sectionId}`;
}
