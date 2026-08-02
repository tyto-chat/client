import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";
import { MoreVerticalIcon } from "@/components/icons";
import { MenuItem } from "@/components/MenuItem";
import { useClickOutside } from "@/hooks/useClickOutside";

export interface MobileActionItem {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

interface Props {
  items: MobileActionItem[];
  leading?: ReactNode;
}

export function MobileActionMenu({ items, leading }: Props) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useClickOutside(containerRef, () => setOpen(false), open, {
    onEscape: () => {
      setOpen(false);
      triggerRef.current?.focus();
    },
  });

  if (items.length === 0 && !leading) return null;

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      {leading}
      {items.length > 0 && (
        <button
          ref={triggerRef}
          type="button"
          data-testid="mobile-action-menu-btn"
          onClick={() => setOpen((v) => !v)}
          aria-label={t("more_actions")}
          aria-haspopup="true"
          aria-expanded={open}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-lg text-fg-muted",
            "hover:bg-raised hover:text-fg",
            " dark:hover:text-white",
          )}
        >
          <MoreVerticalIcon size={20} />
        </button>
      )}
      {open && items.length > 0 && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-md bg-canvas ring-1 ring-inset ring-line py-1 shadow-soft-md",
            "",
          )}
        >
          {items.map((item) => (
            <MenuItem
              key={item.key}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="flex items-center gap-2.5"
            >
              <span className="shrink-0 text-fg-muted">{item.icon}</span>
              <span>{item.label}</span>
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  );
}
