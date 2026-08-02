import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import { XIcon } from "@/components/icons";
import type { MemberItem } from "@/utils/userMentionExtension";

interface Props {
  members: MemberItem[];
  selected: MemberItem | null;
  onSelect: (member: MemberItem | null) => void;
}

const MAX_RESULTS = 8;

export function SearchAuthorAutocomplete({ members, selected, onSelect }: Props) {
  const { t } = useTranslation("channel");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent): void {
      const target = e.target as Node;
      if (
        wrapRef.current &&
        !wrapRef.current.contains(target) &&
        !(listRef.current && listRef.current.contains(target))
      ) {
        setOpen(false);
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
      setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 176) });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
    if (!needle) return sorted.slice(0, MAX_RESULTS);
    return sorted.filter((m) => m.name.toLowerCase().includes(needle)).slice(0, MAX_RESULTS);
  }, [members, query]);

  if (selected) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 text-xs">
        <Avatar
          name={selected.name}
          colorKey={String(selected.id)}
          imageUrl={selected.avatarUrl ?? null}
          size="xs"
        />
        <span className="text-fg">{selected.name}</span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="rounded-full p-0.5 text-fg-subtle hover:bg-black/10 hover:text-fg dark:hover:bg-white/10"
          title={t("search_filter_clear")}
        >
          <XIcon size={10} />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t("search_filter_from_anyone")}
        className="w-44 rounded-md bg-canvas ring-1 ring-inset ring-line px-2 py-1 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      />
      {open &&
        results.length > 0 &&
        rect &&
        createPortal(
          <ul
            ref={listRef}
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
            className="z-[60] max-h-60 overflow-y-auto rounded-lg border border-line bg-overlay py-1 shadow-soft-md"
          >
            {results.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(m);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-surface"
                >
                  <Avatar
                    name={m.name}
                    colorKey={String(m.id)}
                    imageUrl={m.avatarUrl ?? null}
                    size="xs"
                  />
                  <span className="truncate text-fg">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
