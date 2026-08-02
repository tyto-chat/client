import { useEffect, useMemo, useRef, useState } from "react";
import { uuidFromIri } from "@/api/hydra";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SearchIcon, Spinner } from "@/components/icons";
import { SearchAuthorAutocomplete } from "@/components/chat/SearchAuthorAutocomplete";
import { MessageGroup } from "@/components/chat/MessageGroup";
import {
  useChannelSearch,
  useCommunitySearch,
  useConversationSearch,
} from "@/queries/searchQueries";
import { useAuthContext } from "@/context/AuthContext";
import { useTimezone } from "@/context/TimezoneContext";
import { extractMarkedTerms } from "@/utils/highlightTerms";
import type { MemberItem } from "@/utils/userMentionExtension";
import type { SearchFilters } from "@/api/search";
import type { Channel, UserGroup } from "@/types/api";

const EMPTY_MODS: Set<number> = new Set();
const EMPTY_GROUPS: Map<number, UserGroup[]> = new Map();
const noop = (): void => {};

interface BaseProps {
  onClose: () => void;
  members?: MemberItem[];
}

interface ChannelProps extends BaseProps {
  kind: "channel";
  communityId: string;
  channelIdentifier: string;
  channels?: Channel[];
}

interface ConversationProps extends BaseProps {
  kind: "conversation";
  conversationIdentifier: string;
}

type Props = ChannelProps | ConversationProps;

function dateToEpoch(value: string, endOfDay: boolean): number | undefined {
  if (!value) return undefined;
  const d = new Date(value + (endOfDay ? "T23:59:59" : "T00:00:00"));
  const t = d.getTime();
  return Number.isNaN(t) ? undefined : Math.floor(t / 1000);
}

export function SearchDialog(props: Props) {
  const { t } = useTranslation("channel");
  const { timezone } = useTimezone();
  const { user } = useAuthContext();
  const navigate = useNavigate();

  const [rawQuery, setRawQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [author, setAuthor] = useState<MemberItem | null>(null);
  const [beforeDate, setBeforeDate] = useState("");
  const [afterDate, setAfterDate] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [scope, setScope] = useState<"channel" | "community">("channel");
  const dialogRef = useRef<HTMLDivElement>(null);

  function close(): void {
    setIsClosing(true);
    setTimeout(props.onClose, 170);
  }

  useEffect(() => {
    const priorFocus = document.activeElement;
    return () => {
      if (priorFocus && "focus" in priorFocus) (priorFocus as HTMLElement).focus();
    };
  }, []);

  useEffect(() => {
    const FOCUSABLE =
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab") {
        const el = dialogRef.current;
        if (!el) return;
        const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filters = useMemo<SearchFilters>(
    () => ({
      authorId: author?.id,
      before: dateToEpoch(beforeDate, true),
      after: dateToEpoch(afterDate, false),
    }),
    [author, beforeDate, afterDate],
  );

  const hasFilters = filters.authorId != null || filters.before != null || filters.after != null;

  const channelResult = useChannelSearch(
    props.kind === "channel" && scope === "channel" ? props.communityId : "",
    props.kind === "channel" ? props.channelIdentifier : "",
    props.kind === "channel" && scope === "channel" ? submittedQuery : "",
    filters,
  );
  const communityResult = useCommunitySearch(
    props.kind === "channel" && scope === "community" ? props.communityId : "",
    props.kind === "channel" && scope === "community" ? submittedQuery : "",
    filters,
  );
  const conversationResult = useConversationSearch(
    props.kind === "conversation" ? props.conversationIdentifier : "",
    props.kind === "conversation" ? submittedQuery : "",
    filters,
  );
  const active =
    props.kind === "conversation"
      ? conversationResult
      : scope === "community"
        ? communityResult
        : channelResult;

  const trimmedSubmitted = submittedQuery.trim();
  const tooShort = trimmedSubmitted.length > 0 && trimmedSubmitted.length < 2;
  const showEmpty =
    !active.isFetching && trimmedSubmitted.length >= 2 && (active.data?.total ?? 0) === 0;

  const expanded = showFilters || trimmedSubmitted.length > 0;

  function handleHitClick(messageIri: string): void {
    const uuid = uuidFromIri(messageIri);
    if (!uuid) return;
    close();
    void navigate({ to: "/m/$messageId", params: { messageId: uuid } });
  }

  function clearFilters(): void {
    setAuthor(null);
    setBeforeDate("");
    setAfterDate("");
  }

  function runSearch(): void {
    if (rawQuery.trim().length < 2) return;
    setSubmittedQuery(rawQuery);
  }

  return (
    <div
      className={`${isClosing ? "animate-backdrop-out" : "animate-backdrop-in"} fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-24 max-md:px-2 max-md:pt-16`}
      onMouseDown={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("search")}
        data-testid="search-dialog"
        className={`${isClosing ? "animate-modal-out" : "animate-modal-in"} relative flex w-full max-w-xl flex-col overflow-hidden rounded-xl bg-overlay shadow-soft-lg ${expanded ? "max-h-[70vh] max-md:max-h-[calc(100dvh-6rem)]" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <input
            autoFocus
            data-testid="search-input"
            type="text"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
            placeholder={t("search_placeholder")}
            className="flex-1 rounded-md bg-surface ring-1 ring-inset ring-line px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            type="button"
            data-testid="search-submit-btn"
            onClick={runSearch}
            disabled={rawQuery.trim().length < 2}
            className="flex items-center gap-1 rounded-lg bg-accent-gradient px-3 py-2 min-h-9 text-sm font-medium text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
          >
            <SearchIcon size={13} />
            <span className="block cap-trim">{t("search")}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
              showFilters
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-line bg-surface text-fg-muted hover:bg-raised"
            }`}
          >
            {t("search_more")}
          </button>
        </div>

        {props.kind === "channel" && (
          <div className="flex gap-1 px-4 pb-3">
            {(["channel", "community"] as const).map((s) => (
              <button
                key={s}
                type="button"
                data-testid={`search-scope-${s}`}
                onClick={() => setScope(s)}
                className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-xs transition-colors ${
                  scope === s
                    ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]"
                    : "bg-surface text-fg-muted ring-1 ring-inset ring-line hover:bg-raised"
                }`}
              >
                <span className="block cap-trim">
                  {s === "channel" ? t("search_scope_channel") : t("search_scope_community")}
                </span>
              </button>
            ))}
          </div>
        )}

        {showFilters && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2 text-xs">
            <label className="flex items-center gap-2">
              <span className="text-fg-muted">{t("search_filter_from")}</span>
              <SearchAuthorAutocomplete
                members={props.members ?? []}
                selected={author}
                onSelect={setAuthor}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-fg-muted">{t("search_filter_after")}</span>
              <input
                type="date"
                value={afterDate}
                onChange={(e) => setAfterDate(e.target.value)}
                className="rounded-md bg-canvas ring-1 ring-inset ring-line px-1.5 py-0.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-fg-muted">{t("search_filter_before")}</span>
              <input
                type="date"
                value={beforeDate}
                onChange={(e) => setBeforeDate(e.target.value)}
                className="rounded-md bg-canvas ring-1 ring-inset ring-line px-1.5 py-0.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                {t("search_filter_clear")}
              </button>
            )}
          </div>
        )}

        {(trimmedSubmitted.length > 0 || active.isFetching) && (
          <div className="flex-1 overflow-y-auto border-t border-line">
            {active.isFetching && (
              <div className="flex items-center justify-center py-8">
                <Spinner size={22} className="text-[var(--accent-muted)]" />
              </div>
            )}

            {tooShort && !active.isFetching && (
              <p className="px-4 py-6 text-center text-xs text-fg-subtle">{t("search_hint")}</p>
            )}

            {showEmpty && (
              <p className="px-4 py-6 text-center text-xs text-fg-subtle">
                {t("search_no_results", { query: trimmedSubmitted })}
              </p>
            )}

            {!active.isFetching && (active.data?.hits.length ?? 0) > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[0.625rem] uppercase tracking-wide text-fg-subtle">
                  {t("search_results_count", { count: active.data?.total ?? 0 })}
                </p>
                <div className="divide-y divide-line">
                  {active.data?.hits.map((hit) => (
                    <div
                      key={hit.messageId}
                      data-testid="search-result-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleHitClick(hit.messageIri)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleHitClick(hit.messageIri);
                        }
                      }}
                      className="block w-full cursor-pointer px-2 pt-2 transition-colors hover:bg-accent-subtle/30"
                    >
                      {props.kind === "channel" &&
                        scope === "community" &&
                        hit.channelIdentifier && (
                          <span className="mt-1.5 inline-block rounded bg-surface px-1.5 py-0.5 text-[0.625rem] font-medium text-fg-muted ring-1 ring-inset ring-line">
                            #
                            {props.channels?.find((c) => c.identifier === hit.channelIdentifier)
                              ?.name ?? hit.channelIdentifier}
                          </span>
                        )}
                      {props.kind === "channel" &&
                        scope === "community" &&
                        hit.channelIdentifier &&
                        !!props.channels?.find((c) => c.identifier === hit.channelIdentifier)
                          ?.archivedAt && (
                          <span className="mt-1.5 ml-1 inline-block rounded bg-surface px-1.5 py-0.5 text-[0.625rem] font-medium text-fg-muted ring-1 ring-inset ring-line">
                            {t("archived_badge")}
                          </span>
                        )}
                      {hit.message.parent != null && (
                        <span className="mt-1.5 ml-1 inline-block rounded bg-surface px-1.5 py-0.5 text-[0.625rem] font-medium text-fg-muted ring-1 ring-inset ring-line">
                          {t("search_in_thread")}
                        </span>
                      )}
                      <MessageGroup
                        group={{
                          isOwn: hit.message.createdBy?.id === user?.id,
                          msgs: [hit.message],
                        }}
                        groupIndex={0}
                        communityId={props.kind === "channel" ? props.communityId : undefined}
                        user={user}
                        isChannelModerator={false}
                        moderatorUserIds={EMPTY_MODS}
                        groupsByUserId={EMPTY_GROUPS}
                        timezone={timezone}
                        onToggleReaction={noop}
                        onDeleteMessage={noop}
                        onEditMessage={noop}
                        onViewHistory={noop}
                        onUserClick={noop}
                        onDeleteAttachment={noop}
                        readOnly
                        highlightTerms={extractMarkedTerms(hit.snippet)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
