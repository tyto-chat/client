import { describe, it, expect } from "vitest";
import { sectionIri, toIri } from "@/api/hydra";

describe("toIri", () => {
  it("builds a versioned relation IRI (API Platform resolves body IRIs through the router)", () => {
    expect(toIri("communities", 7)).toBe("/api/v1/communities/7");
  });

  it("accepts string ids", () => {
    expect(toIri("sections", "abc-slug")).toBe("/api/v1/sections/abc-slug");
  });
});

describe("sectionIri", () => {
  it("nests the section under its community — a flat /sections/{id} IRI no longer resolves", () => {
    expect(sectionIri("my-community", 3)).toBe("/api/v1/communities/my-community/sections/3");
  });
});
