import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { BellIcon, BellOffIcon, CheckIcon } from "@/components/icons";
import {
  useChannelNotificationLevel,
  useSetChannelNotificationLevel,
} from "@/queries/notificationPreferenceQueries";
import type { ChannelNotificationLevel } from "@/types/api";

interface Props {
  communityIdentifier: string;
  channelIdentifier: string;
  channelId: number;
}

export function ChannelNotificationMenu({
  communityIdentifier,
  channelIdentifier,
  channelId,
}: Props) {
  const { t } = useTranslation("channel");
  const level = useChannelNotificationLevel(channelId);
  const set = useSetChannelNotificationLevel();
  const [open, setOpen] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(null);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = (next: ChannelNotificationLevel) => {
    setOpen(null);
    set.mutate({
      communityIdentifier,
      channelIdentifier,
      channelId,
      level: next === "mentions" ? null : next,
    });
  };

  const Icon = level === "none" ? BellOffIcon : BellIcon;
  const showAtRest = level !== "mentions";

  const popover = open
    ? createPortal(
        <Dropdown pos={open} popoverRef={popoverRef} level={level} apply={apply} t={t} />,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={btnRef}
        data-testid="channel-notif-menu-btn"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) {
            setOpen(null);
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          setOpen({ top: rect.bottom + 4, left: Math.max(8, rect.left - 120) });
        }}
        title={t("notification_level", { level: t(`notification_levels.${level}`) })}
        aria-haspopup="true"
        aria-expanded={!!open}
        className={`shrink-0 text-fg-muted hover:text-fg dark:hover:text-white ${
          showAtRest
            ? "opacity-80"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        <Icon size={12} />
      </button>
      {popover}
    </>
  );
}

function Dropdown({
  pos,
  popoverRef,
  level,
  apply,
  t,
}: {
  pos: { top: number; left: number };
  popoverRef: React.RefObject<HTMLDivElement | null>;
  level: ChannelNotificationLevel;
  apply: (next: ChannelNotificationLevel) => void;
  t: TFunction<"channel">;
}) {
  return (
    <div
      ref={popoverRef}
      style={{ position: "fixed", top: pos.top, left: pos.left }}
      className="z-50 w-44 rounded-md bg-canvas ring-1 ring-inset ring-line py-1 text-sm shadow-soft-md"
    >
      {(["all", "mentions", "none"] as const).map((v) => (
        <button
          key={v}
          data-testid={`notif-level-${v}`}
          onClick={() => apply(v)}
          className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-surface"
        >
          <span>{t(`notification_levels.${v}`)}</span>
          {level === v && <CheckIcon size={12} />}
        </button>
      ))}
    </div>
  );
}
