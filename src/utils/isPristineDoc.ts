import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export function isPristineDoc(doc: ProseMirrorNode): boolean {
  const only = doc.childCount === 1 ? doc.firstChild : null;
  return only !== null && only.type.name === "paragraph" && only.content.size === 0;
}
