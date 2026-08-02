import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UnifiedEmojiPicker } from "@/components/chat/UnifiedEmojiPicker";
import { GroupIcon } from "@/components/GroupIcon";
import { groupChipStyle } from "@/utils/groupChipStyle";
import { useClickOutside } from "@/hooks/useClickOutside";
import { sectionHeading } from "@/components/ui/styles";

interface Props {
  value: string;
  onChange: (value: string) => void;
  communityIdentifier: string | undefined;
  color?: string | null;
  label?: string;
}

/**
 * Group icon field: a tile that renders the current icon (unicode or custom
 * community emoji) and opens the unified emoji picker. Shared by the community
 * settings Groups tab and the "My groups" editor so both look and behave the
 * same.
 */
export function GroupIconPicker({ value, onChange, communityIdentifier, color, label }: Props) {
  const { t } = useTranslation(["community", "common"]);
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} className="relative shrink-0">
      {label && <p className={sectionHeading}>{label}</p>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={label ?? t("group_icon_label")}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-2xl ring-1 ring-inset ring-line-strong hover:bg-raised"
        style={groupChipStyle(color)}
      >
        {value ? (
          <GroupIcon icon={value} name="" communityIdentifier={communityIdentifier} />
        ) : (
          <span className="text-base text-fg-subtle">+</span>
        )}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="mt-1 block w-full text-center text-xs text-fg-subtle hover:text-fg"
        >
          {t("common:remove")}
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1">
          <UnifiedEmojiPicker
            communityIdentifier={communityIdentifier}
            onPick={(picked) => {
              onChange(picked);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
