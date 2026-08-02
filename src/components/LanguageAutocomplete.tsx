import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { buildLanguageOptions, isSupportedLanguage, languageLabel } from "@/utils/languages";

interface Props {
  value: string;
  onChange: (code: string) => void;
  testId?: string;
}

const MAX_RESULTS = 12;

export function LanguageAutocomplete({ value, onChange, testId }: Props) {
  const { t, i18n } = useTranslation("community");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const options = useMemo(() => buildLanguageOptions(i18n.language), [i18n.language]);

  useEffect(() => {
    function onClick(e: MouseEvent): void {
      const target = e.target as Node;
      if (
        wrapRef.current &&
        !wrapRef.current.contains(target) &&
        !(listRef.current && listRef.current.contains(target))
      ) {
        setOpen(false);
        setEditing(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options.slice(0, MAX_RESULTS);
    return options
      .filter(
        (o) =>
          o.label.toLowerCase().includes(needle) ||
          o.nativeLabel.toLowerCase().includes(needle) ||
          o.code.startsWith(needle),
      )
      .slice(0, MAX_RESULTS);
  }, [options, query]);

  const displayValue = editing ? query : languageLabel(value, i18n.language);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={displayValue}
        data-testid={testId}
        onChange={(e) => {
          setQuery(e.target.value);
          setEditing(true);
          setOpen(true);
        }}
        onFocus={() => {
          setEditing(true);
          setQuery("");
          setOpen(true);
        }}
        placeholder={t("community_locale_search")}
        className="w-full rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      />
      {!isSupportedLanguage(value) && !editing && (
        <p className="mt-1 text-xs text-warning">{t("community_locale_fallback_hint")}</p>
      )}
      {open &&
        results.length > 0 &&
        rect &&
        createPortal(
          <ul
            ref={listRef}
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
            className="z-[60] max-h-64 overflow-y-auto rounded-lg border border-line bg-overlay py-1 shadow-soft-md"
          >
            {results.map((o) => (
              <li key={o.code}>
                <button
                  type="button"
                  data-testid={testId ? `${testId}-option-${o.code}` : undefined}
                  onClick={() => {
                    onChange(o.code);
                    setQuery("");
                    setEditing(false);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface"
                >
                  <span className="truncate text-fg">
                    {o.label}
                    {o.nativeLabel !== o.label && (
                      <span className="ml-1.5 text-xs text-fg-subtle">{o.nativeLabel}</span>
                    )}
                  </span>
                  {o.supported && (
                    <span className="shrink-0 rounded-full bg-[var(--accent)]/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-[var(--accent-text)]">
                      {t("community_locale_translated")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
