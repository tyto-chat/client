import { useMemo, useRef, useState, useLayoutEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { marked } from "marked";
import { sanitizeMessageHtml } from "@/utils/sanitize";
import { highlightCodeBlocks } from "@/utils/highlightHtml";
import { autoLinkUrls } from "@/utils/autoLink";
import { highlightTerms } from "@/utils/highlightTerms";
import { replaceEmojiShortcodes } from "@/utils/emojiShortcodes";
import { useCommunityEmojis } from "@/queries/communityEmojiQueries";
import { extractYouTubeIds } from "@/utils/youtube";
import { extractImageUrls } from "@/utils/images";
import { YoutubeEmbed } from "./YoutubeEmbed";
import { ImageEmbed } from "./ImageEmbed";
import { gateRemoteImages, revealRemoteImage, useRemoteContentPolicy } from "@/utils/remoteContent";
import { useAllowRemoteHost } from "@/hooks/useAllowRemoteHost";
import { ExternalLinkModal } from "./ExternalLinkModal";
import { MessageQuotePreview } from "./MessageQuotePreview";
import { extractFirstPermalink } from "@/utils/extractFirstPermalink";
import { openLinkedMessage } from "@/utils/openLinkedMessage";
import { serverOrigin } from "@/utils/permalinkOrigins";
import { useServerDirectory } from "@/platform/serverDirectory";
import type { CommunityEmoji } from "@/types/api";
import { parseInertHtml } from "@/utils/inertHtml";
import { ENCRYPTED_REMOTE_POLICY, type ContentRenderPolicy } from "@/e2ee/renderPolicy";

const COLLAPSE_VIEWPORT_RATIO = 0.3;

interface Props {
  text: string | null;
  className?: string;
  communityId?: string;
  onUserClick?: (userId: number) => void;
  messageIri?: string;
  renderPermalinkPreview?: boolean;
  highlightTerms?: readonly string[];
  emojis?: CommunityEmoji[];
  renderPolicy?: ContentRenderPolicy;
}

function convertMentionLinks(html: string): string {
  // DOMParser is inert — a live innerHTML here would execute payloads before DOMPurify runs.
  const body = new DOMParser().parseFromString(html, "text/html").body;

  for (const a of body.querySelectorAll<HTMLAnchorElement>('a[href^="user:"]')) {
    const id = a.getAttribute("href")!.slice("user:".length);
    const span = document.createElement("span");
    span.className = "mention-user";
    span.dataset.userId = id;
    span.textContent = a.textContent;
    a.replaceWith(span);
  }

  for (const a of body.querySelectorAll<HTMLAnchorElement>('a[href^="channel:"]')) {
    const id = a.getAttribute("href")!.slice("channel:".length);
    const span = document.createElement("span");
    span.className = "mention-channel";
    span.dataset.channelId = id;
    span.textContent = a.textContent;
    a.replaceWith(span);
  }

  for (const a of body.querySelectorAll<HTMLAnchorElement>('a[href^="broadcast:"]')) {
    const scope = a.getAttribute("href")!.slice("broadcast:".length);
    const span = document.createElement("span");
    span.className = "mention-broadcast";
    span.dataset.broadcast = scope;
    span.textContent = a.textContent;
    a.replaceWith(span);
  }

  return body.innerHTML;
}

function normalizeRenderedHtml(html: string): string {
  const div = parseInertHtml(html);

  const isEmpty = (el: Element) => el.tagName === "P" && (el.textContent?.trim() ?? "") === "";

  while (div.firstElementChild && isEmpty(div.firstElementChild)) {
    div.firstElementChild.remove();
  }
  while (div.lastElementChild && isEmpty(div.lastElementChild)) {
    div.lastElementChild.remove();
  }

  let prevEmpty = false;
  for (const child of [...div.children]) {
    const empty = isEmpty(child);
    if (empty && prevEmpty) child.remove();
    prevEmpty = empty;
  }

  for (const child of [...div.children]) {
    if (isEmpty(child)) child.innerHTML = "<br>";
  }

  for (const p of [...div.querySelectorAll("p")]) {
    while (p.firstChild?.nodeName === "BR") p.firstChild.remove();
    while (p.lastChild?.nodeName === "BR") p.lastChild.remove();
    let brRun = 0;
    for (const node of [...p.childNodes]) {
      if (node.nodeName === "BR") {
        brRun++;
        if (brRun > 2) node.remove();
      } else {
        brRun = 0;
      }
    }
  }

  return div.innerHTML;
}

function handleCodeBlockClick(e: React.MouseEvent<HTMLDivElement>) {
  const btn = (e.target as Element).closest<HTMLButtonElement>("[data-copy-btn]");
  if (!btn) return;
  const code = btn.closest("pre")?.querySelector("code")?.textContent ?? "";
  void navigator.clipboard.writeText(code).catch(() => {});
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  btn.disabled = true;
  btn.classList.add("code-copy-btn--copied");
  setTimeout(() => {
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;
    btn.disabled = false;
    btn.classList.remove("code-copy-btn--copied");
  }, 2000);
}

export function MessageContent({
  text,
  className,
  communityId,
  onUserClick,
  messageIri,
  renderPermalinkPreview = true,
  highlightTerms: terms,
  emojis,
  renderPolicy = "plain",
}: Props) {
  const encrypted = renderPolicy === "encrypted";
  const { t } = useTranslation("channel");
  const { data: fetchedEmojis } = useCommunityEmojis(emojis ? undefined : communityId);
  const communityEmojis = emojis ?? fetchedEmojis;
  const serverDirectory = useServerDirectory();
  const userRemoteContent = useRemoteContentPolicy();
  const remoteContent = encrypted ? ENCRYPTED_REMOTE_POLICY : userRemoteContent;
  const allowRemoteHost = useAllowRemoteHost();
  const __html = useMemo(() => {
    const normalized = (text ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    let html = replaceEmojiShortcodes(
      gateRemoteImages(
        autoLinkUrls(
          normalizeRenderedHtml(
            sanitizeMessageHtml(convertMentionLinks(marked.parse(normalized, { async: false }))),
          ),
          serverDirectory,
        ),
        {
          load: (host) => t("remote_content_load_image", { host }),
          always: (domain) => t("remote_content_always_load", { host: domain }),
        },
        remoteContent,
      ),
      communityEmojis,
    );
    if (terms && terms.length > 0) {
      html = highlightTerms(html, terms);
    }
    return highlightCodeBlocks(html);
  }, [text, communityEmojis, terms, t, remoteContent, serverDirectory]);

  const youtubeIds = useMemo(
    () => (encrypted ? [] : extractYouTubeIds(text ?? "")),
    [text, encrypted],
  );
  const imageUrls = useMemo(
    () => (encrypted ? [] : extractImageUrls(text ?? "")),
    [text, encrypted],
  );
  const previewTarget = useMemo(
    () => (renderPermalinkPreview && !encrypted ? extractFirstPermalink(__html) : null),
    [__html, renderPermalinkPreview, encrypted],
  );

  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [collapsible, setCollapsible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const tooTall = el.scrollHeight > window.innerHeight * COLLAPSE_VIEWPORT_RATIO;
    setCollapsible(tooTall);
    if (tooTall) setExpanded(false);
  }, [__html]);

  if (text == null) {
    return <span className="text-sm italic text-fg-subtle">{t("message_deleted")}</span>;
  }

  const collapsedHeight = Math.round(window.innerHeight * COLLAPSE_VIEWPORT_RATIO);

  const handleShowMore = () => {
    setExpanded(true);
    setTimeout(() => {
      wrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 0);
  };

  function handleContentClick(e: React.MouseEvent<HTMLDivElement>) {
    const mention = (e.target as Element).closest<HTMLSpanElement>("span.mention-channel");
    if (mention && communityId) {
      const channelId = mention.dataset.channelId ?? mention.textContent?.replace(/^#/, "").trim();
      if (channelId) {
        navigate({ to: "/$communityId/$channelId", params: { communityId, channelId } });
        return;
      }
    }
    const userMention = (e.target as Element).closest<HTMLSpanElement>("span.mention-user");
    if (userMention && onUserClick) {
      const userId = Number.parseInt(userMention.dataset.userId ?? "", 10);
      if (!Number.isNaN(userId)) {
        onUserClick(userId);
        return;
      }
    }
    const alwaysLoad = (e.target as Element).closest<HTMLButtonElement>(
      "button.remote-image-always",
    );
    if (alwaysLoad) {
      e.preventDefault();
      if (alwaysLoad.dataset.remoteHost) allowRemoteHost(alwaysLoad.dataset.remoteHost);
      return;
    }
    const blockedImage = (e.target as Element).closest<HTMLButtonElement>(
      "button.remote-image-placeholder",
    );
    if (blockedImage) {
      e.preventDefault();
      revealRemoteImage(blockedImage);
      return;
    }
    const internal = (e.target as Element).closest<HTMLAnchorElement>("a[data-internal-link]");
    if (internal) {
      e.preventDefault();
      const uuid = internal.dataset.internalLink;
      if (uuid) {
        openLinkedMessage(
          { origin: internal.dataset.internalOrigin ?? serverOrigin(), uuid },
          navigate,
        );
      }
      return;
    }
    const link = (e.target as Element).closest<HTMLAnchorElement>("a[data-external-link]");
    if (link) {
      e.preventDefault();
      setPendingUrl(link.dataset.externalLink ?? link.href);
      return;
    }
    handleCodeBlockClick(e);
  }

  return (
    <div
      ref={wrapperRef}
      className={`message-content text-sm leading-relaxed text-fg ${className ?? ""}`}
    >
      {pendingUrl && <ExternalLinkModal url={pendingUrl} onClose={() => setPendingUrl(null)} />}
      {previewTarget && (
        <MessageQuotePreview
          target={previewTarget}
          selfMessageIri={messageIri}
          hostCommunityId={communityId}
        />
      )}
      <div className="relative">
        <div
          role="presentation"
          ref={contentRef}
          style={
            collapsible && !expanded
              ? { maxHeight: `${collapsedHeight}px`, overflow: "hidden" }
              : undefined
          }
          dangerouslySetInnerHTML={{ __html }}
          onClick={handleContentClick}
        />
        {collapsible && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-canvas/80 to-transparent" />
        )}
      </div>
      {youtubeIds.slice(0, 1).map((id) => (
        <YoutubeEmbed key={id} videoId={id} />
      ))}
      {imageUrls.slice(0, 1).map((url) => (
        <ImageEmbed key={url} url={url} />
      ))}
      {collapsible && (
        <div className="mt-1 flex justify-center">
          <button
            onClick={expanded ? () => setExpanded(false) : handleShowMore}
            className="flex items-center gap-1 text-xs text-accent-text hover:opacity-80 hover:underline transition-colors duration-150"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {expanded ? t("show_less") : t("show_more")}
          </button>
        </div>
      )}
    </div>
  );
}
