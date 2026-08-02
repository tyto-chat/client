import { toHtml } from "hast-util-to-html";
import { lowlight } from "@/utils/lowlight";

export function highlightCodeBlocks(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc.querySelectorAll("pre code").forEach((codeEl) => {
    const text = codeEl.textContent ?? "";
    if (!text.trim()) return;

    const langMatch = codeEl.className.match(/language-(\w+)/);
    const language = langMatch?.[1] ?? null;

    try {
      const tree =
        language && lowlight.listLanguages().includes(language)
          ? lowlight.highlight(language, text)
          : lowlight.highlightAuto(text);

      codeEl.innerHTML = toHtml(tree);

      const detectedLang = language ?? (tree.data as { language?: string } | undefined)?.language;
      const preEl = codeEl.parentElement;
      if (preEl?.tagName === "PRE") {
        if (detectedLang) preEl.setAttribute("data-language", detectedLang);

        const btn = doc.createElement("button");
        btn.className = "code-copy-btn";
        btn.setAttribute("data-copy-btn", "");
        btn.setAttribute("aria-label", "Copy code");
        btn.setAttribute("title", "Copy code");
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;
        preEl.appendChild(btn);
      }
    } catch {
      /* ignore */
    }
  });

  return doc.body.innerHTML;
}
