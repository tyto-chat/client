import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message } from "@/types/api";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useViewportClamp } from "@/hooks/useViewportClamp";
import { QuickReactionPicker } from "@/components/chat/QuickReactionPicker";
import { EmojiRenderer } from "@/components/chat/EmojiRenderer";
import { useCommunityEmojis } from "@/queries/communityEmojiQueries";
import { useReactionUsers } from "@/queries/reactionQueries";
import { useAuthContext } from "@/context/AuthContext";

interface Props {
  show: boolean;
  message: Message;
  currentUserId: number;
  communityIdentifier: string;
  disabled?: boolean;
  onToggle: (emoji: string, existingId?: number) => void;
}

function ReactionTooltip({
  messageIri,
  emoji,
  children,
}: {
  messageIri: string;
  emoji: string;
  children: React.ReactNode;
}) {
  const { user } = useAuthContext();
  const currentUserProfileIri = user?.profile?.["@id"];
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { data: users } = useReactionUsers(messageIri, emoji, enabled);

  function scheduleShow() {
    clearTimeout(hideTimerRef.current);
    showTimerRef.current = setTimeout(() => {
      setEnabled(true);
      setVisible(true);
    }, 800);
  }

  function scheduleHide() {
    clearTimeout(showTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), 150);
  }

  function cancelHide() {
    clearTimeout(hideTimerRef.current);
  }

  const names = users?.map((u) => (u.profile === currentUserProfileIri ? "You" : u.name));

  return (
    <div className="relative inline-flex">
      <div onMouseEnter={scheduleShow} onMouseLeave={scheduleHide}>
        {children}
      </div>
      {visible && names && names.length > 0 && (
        <div
          className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 z-20"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div className="max-h-48 overflow-y-auto whitespace-nowrap rounded-lg border border-line bg-overlay px-2.5 py-1.5 text-xs text-fg shadow-md">
            {names.map((name, i) => (
              <div
                key={`${name ?? ""}-${i}`}
                className={i === 0 && name === "You" ? "font-semibold" : ""}
              >
                {name}
              </div>
            ))}
          </div>
          <div className="mx-auto w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-overlay" />
        </div>
      )}
    </div>
  );
}

export function MessageReactions({
  show,
  message,
  currentUserId,
  communityIdentifier,
  disabled,
  onToggle,
}: Props) {
  const { t } = useTranslation("common");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const { data: emojis } = useCommunityEmojis(communityIdentifier);
  const { reactions } = message;
  const hasReactions = !!reactions && Object.keys(reactions).length > 0;

  const clampRef = useViewportClamp(pickerOpen);

  useClickOutside(pickerRef, () => setPickerOpen(false), pickerOpen);

  if (!hasReactions) return null;

  return (
    <div className="mt-1.5 flex min-h-6 flex-wrap items-center gap-1">
      {/* Deliberately unsorted: sorting by count would reshuffle pills on every click. */}
      {Object.entries(reactions).map(([emoji, entries]) => {
        const myEntry = entries.find((e) => e.userId === currentUserId);
        return (
          <ReactionTooltip key={emoji} messageIri={message["@id"]} emoji={emoji}>
            <button
              onClick={() => !disabled && onToggle(emoji, myEntry?.id)}
              disabled={disabled}
              className={`inline-flex min-h-6 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold leading-none ring-1 ring-inset transition-colors ${
                myEntry
                  ? "bg-accent-subtle text-accent ring-line hover:opacity-85"
                  : "text-fg-muted ring-line hover:bg-surface"
              } ${disabled ? "cursor-default" : ""}`}
            >
              <EmojiRenderer emoji={emoji} emojis={emojis} />{" "}
              {entries.length > 1 ? (
                <span className="block cap-trim text-xs font-medium">{entries.length}</span>
              ) : null}
            </button>
          </ReactionTooltip>
        );
      })}

      {!disabled && (
        <div
          className={`relative ${show || pickerOpen ? "inline-flex" : "hidden [@media(hover:hover)]:group-[:focus-visible,:focus-within:has(:focus-visible)]/msg:inline-flex"}`}
          ref={pickerRef}
        >
          <button
            onClick={() => setPickerOpen((p) => !p)}
            title={t("add_reaction")}
            className="inline-flex min-h-6 items-center gap-1 rounded-full px-2 py-1 text-xs leading-none text-fg-subtle ring-1 ring-inset ring-line transition-colors hover:bg-surface hover:text-fg-muted"
          >
            +
          </button>
          {pickerOpen && (
            <div ref={clampRef} className="absolute bottom-full left-0 z-10 mb-1">
              <QuickReactionPicker
                communityIdentifier={communityIdentifier}
                onPick={(value) => {
                  const myEntry = reactions[value]?.find((e) => e.userId === currentUserId);
                  onToggle(value, myEntry?.id);
                  setPickerOpen(false);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
