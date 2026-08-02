import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SearchIcon, HistoryIcon, StickerIcon } from "@/components/icons";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { CommunityEmoji } from "@/types/api";
import { useCommunityEmojis } from "@/queries/communityEmojiQueries";
import {
  listCategories,
  listEmojisInCategory,
  searchUnicode,
  type CategoryMeta,
  type UnicodeEmoji,
} from "@/utils/emojiCatalog";
import {
  getSkinTone,
  setSkinTone as persistSkinTone,
  skinToneGlyph as toneGlyph,
  SKIN_TONE_COUNT,
} from "@/utils/emojiSkinTone";
import { getEmojiLabel } from "@/utils/emojiNameI18n";
import { useEmojiLabelsVersion } from "@/hooks/useEmojiLabelsVersion";
import { getTopEmojiKeys } from "@/utils/emojiUsage";

interface Props {
  communityIdentifier: string | undefined;
  onPick: (reactionValue: string) => void;
}

function EmojiCell({
  label,
  glyph,
  imageUrl,
  onClick,
  onHover,
}: {
  label: string;
  glyph?: string;
  imageUrl?: string;
  onClick: () => void;
  onHover?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      title={label}
      className="flex h-[34px] w-full items-center justify-center rounded-lg text-[1.1875rem] leading-none transition-colors hover:bg-surface"
    >
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="h-5 w-5" loading="lazy" decoding="async" />
      ) : (
        <span>{glyph ?? label}</span>
      )}
    </button>
  );
}

type Tab = "recent" | "community" | string;

const RECENT_FALLBACK = ["👍", "❤️", "😂", "🎉", "😢", "🔥", "🙏", "👀"];

interface RenderedEntry {
  key: string;
  value: string;
  label: string;
  glyph?: string;
  imageUrl?: string;
}

interface Section {
  key: string;
  label?: string;
  entries: RenderedEntry[];
}

export function UnifiedEmojiPicker({ communityIdentifier, onPick }: Props) {
  const { t } = useTranslation("common");
  const { data: communityEmojis } = useCommunityEmojis(communityIdentifier);
  const labelsVersion = useEmojiLabelsVersion();
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("recent");
  const [query, setQuery] = useState("");
  const [skinTone, setSkinTone] = useState<number>(getSkinTone);
  const [toneOpen, setToneOpen] = useState(false);
  const toneRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{
    label: string;
    glyph?: string;
    imageUrl?: string;
  } | null>(null);

  const toneBtnRef = useRef<HTMLButtonElement>(null);
  useClickOutside(toneRef, () => setToneOpen(false), toneOpen, {
    onEscape: () => {
      setToneOpen(false);
      toneBtnRef.current?.focus();
    },
  });

  function chooseTone(tone: number) {
    setSkinTone(tone);
    persistSkinTone(tone);
    setToneOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    void listCategories().then((cats) => {
      if (!cancelled) setCategories(cats);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function communityEntry(emoji: CommunityEmoji): RenderedEntry {
    return {
      key: `c:${emoji.id}`,
      value: emoji.shortcode,
      label: emoji.name ?? emoji.shortcode,
      imageUrl: emoji.image?.contentUrl ?? undefined,
    };
  }

  function unicodeEntry(emoji: UnicodeEmoji): RenderedEntry {
    return {
      key: `u:${emoji.id}`,
      value: emoji.glyph,
      label: getEmojiLabel(emoji.glyph) ?? emoji.name,
      glyph: emoji.glyph,
    };
  }

  const syncSections = useMemo<Section[] | null>(() => {
    if (query.trim()) return null;

    const customs = communityEmojis ?? [];

    if (activeTab === "recent") {
      const sections: Section[] = [];
      if (customs.length > 0) {
        sections.push({
          key: "custom",
          label: t("emoji_section_custom"),
          entries: customs.map(communityEntry),
        });
      }
      const frequent: RenderedEntry[] = [];
      const seen = new Set<string>();
      for (const key of getTopEmojiKeys(communityIdentifier ?? "", 24)) {
        if (seen.has(key)) continue;
        seen.add(key);
        if (key.startsWith(":") && key.endsWith(":")) continue;
        frequent.push({ key: `r:${key}`, value: key, label: key, glyph: key });
      }
      if (frequent.length === 0) {
        for (const glyph of RECENT_FALLBACK) {
          frequent.push({ key: `r:${glyph}`, value: glyph, label: glyph, glyph });
        }
      }
      sections.push({ key: "frequent", label: t("emoji_section_frequent"), entries: frequent });
      return sections;
    }

    if (activeTab === "community") {
      return [
        {
          key: "custom",
          label: t("emoji_section_custom"),
          entries: customs.map(communityEntry),
        },
      ];
    }

    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, communityEmojis, communityIdentifier, query, labelsVersion]);

  const [asyncSections, setAsyncSections] = useState<Section[]>([]);
  useEffect(() => {
    if (syncSections !== null) return;
    let cancelled = false;
    const compute = async (): Promise<Section[]> => {
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const fromCommunity = (communityEmojis ?? [])
          .filter(
            (e) =>
              e.shortcode.toLowerCase().includes(q) ||
              (e.name !== null && e.name.toLowerCase().includes(q)),
          )
          .map(communityEntry);
        const fromUnicode = (await searchUnicode(query, skinTone)).map(unicodeEntry);
        const sections: Section[] = [];
        if (fromCommunity.length > 0) {
          sections.push({
            key: "custom",
            label: t("emoji_section_custom"),
            entries: fromCommunity,
          });
        }
        sections.push({ key: "results", label: t("emoji_section_results"), entries: fromUnicode });
        return sections;
      }
      const entries = (await listEmojisInCategory(activeTab, skinTone)).map(unicodeEntry);
      return [{ key: activeTab, entries }];
    };
    void compute().then((result) => {
      if (!cancelled) setAsyncSections(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    syncSections,
    activeTab,
    communityEmojis,
    communityIdentifier,
    query,
    skinTone,
    labelsVersion,
  ]);

  const sections = syncSections ?? asyncSections;
  const isEmpty = sections.every((s) => s.entries.length === 0);

  const tabs: Array<{ id: Tab; icon: ReactNode; label: string }> = [
    {
      id: "recent",
      icon: <HistoryIcon size={16} />,
      label: t("emoji_tab_recent", { defaultValue: "Recent" }),
    },
  ];
  if (communityEmojis && communityEmojis.length > 0) {
    tabs.push({
      id: "community",
      icon: <StickerIcon size={16} />,
      label: t("emoji_tab_community", { defaultValue: "Community" }),
    });
  }
  for (const c of categories) {
    tabs.push({ id: c.id, icon: c.icon, label: t(c.labelKey, { defaultValue: c.id }) });
  }

  return (
    <div className="flex w-[21.25rem] flex-col overflow-hidden rounded-xl border border-line bg-overlay shadow-soft">
      <div className="m-3 flex items-center gap-2 rounded-[10px] bg-surface px-[11px] py-2 text-fg-subtle ring-1 ring-inset ring-line focus-within:ring-2 focus-within:ring-[var(--accent)]">
        <SearchIcon size={15} className="shrink-0" />
        <input
          autoFocus
          type="text"
          placeholder={t("search_placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
        />
      </div>

      {!query.trim() && (
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-line px-2.5 pb-2 text-fg-muted">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg text-[0.9375rem] leading-none transition-colors ${
                activeTab === tab.id
                  ? "bg-accent-subtle text-accent ring-1 ring-inset ring-[var(--accent)]/25"
                  : "hover:bg-surface"
              }`}
            >
              {tab.icon}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto overflow-x-hidden pb-2">
        {isEmpty ? (
          <div className="px-3.5 py-3 text-xs text-fg-muted">
            {t("emoji_no_results", { defaultValue: "No matches." })}
          </div>
        ) : (
          sections.map((section) =>
            section.entries.length === 0 ? null : (
              <div key={section.key}>
                {section.label && (
                  <div className="px-3.5 pb-1 pt-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-fg-subtle">
                    {section.label}
                  </div>
                )}
                <div className="grid grid-cols-8 gap-0.5 px-2.5">
                  {section.entries.map((entry) => (
                    <EmojiCell
                      key={entry.key}
                      label={entry.label}
                      glyph={entry.glyph}
                      imageUrl={entry.imageUrl}
                      onClick={() => onPick(entry.value)}
                      onHover={() =>
                        setPreview({
                          label: entry.label,
                          glyph: entry.glyph,
                          imageUrl: entry.imageUrl,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            ),
          )
        )}
      </div>

      <div className="flex h-11 items-center gap-2 border-t border-line px-3.5 text-[0.8125rem] text-fg-muted">
        {preview ? (
          <>
            <span className="flex h-6 w-6 items-center justify-center text-xl leading-none">
              {preview.imageUrl ? (
                <img src={preview.imageUrl} alt={preview.label} className="h-5 w-5" />
              ) : (
                (preview.glyph ?? preview.label)
              )}
            </span>
            <span className="truncate">{preview.label}</span>
          </>
        ) : (
          <span className="text-fg-subtle">
            {t("emoji_pick_hint", { defaultValue: "Pick an emoji" })}
          </span>
        )}

        <div ref={toneRef} className="relative ml-auto">
          <button
            ref={toneBtnRef}
            type="button"
            onClick={() => setToneOpen((o) => !o)}
            title={t("emoji_skin_tone")}
            aria-label={t("emoji_skin_tone")}
            aria-haspopup="true"
            aria-expanded={toneOpen}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-lg leading-none transition-colors hover:bg-surface"
          >
            {toneGlyph(skinTone)}
          </button>
          {toneOpen && (
            <div className="absolute bottom-full right-0 mb-1 flex gap-0.5 rounded-lg border border-line bg-overlay p-1 shadow-soft-md">
              {Array.from({ length: SKIN_TONE_COUNT }, (_, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => chooseTone(i)}
                  title={`${t("emoji_skin_tone")} ${i + 1}`}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-lg leading-none transition-colors hover:bg-surface ${
                    i === skinTone
                      ? "bg-accent-subtle ring-1 ring-inset ring-[var(--accent)]/25"
                      : ""
                  }`}
                >
                  {toneGlyph(i)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
