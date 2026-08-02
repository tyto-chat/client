import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { lowlight } from "@/utils/lowlight";

const LANGUAGES = ["auto", ...lowlight.listLanguages().sort()];

export function CodeBlockComponent({ node, updateAttributes }: NodeViewProps) {
  const { t } = useTranslation("channel");
  const language = node.attrs.language as string | null;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(node.textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <NodeViewWrapper className="relative my-0.5">
      <div contentEditable={false} className="absolute right-2 top-2 z-10">
        <select
          value={language ?? "auto"}
          onChange={(e) => {
            const val = e.target.value;
            updateAttributes({ language: val === "auto" ? null : val });
          }}
          aria-label={t("code_language")}
          className="cursor-pointer rounded border border-line bg-surface/90 px-1.5 py-0.5 text-xs text-fg-muted outline-none backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>
      <div contentEditable={false} className="absolute right-2 bottom-2 z-10">
        <button
          onClick={handleCopy}
          aria-label={t("copy_code")}
          title={copied ? t("copied") : t("copy_code")}
          className={`flex items-center justify-center rounded border p-1 transition-colors ${copied ? "border-success bg-success-subtle text-success" : "border-line bg-surface text-fg-subtle hover:text-fg-muted"}`}
        >
          {copied ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            </svg>
          )}
        </button>
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
