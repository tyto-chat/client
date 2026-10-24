let inertDocument: Document | null = null;

export function parseInertHtml(html: string): HTMLElement {
  inertDocument ??= document.implementation.createHTMLDocument("");
  const container = inertDocument.createElement("div");
  container.innerHTML = html;
  return container;
}
