import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { fetchEmbedData, type EmbedData } from "./api";
import { sanitizeMessageHtml } from "@/utils/sanitize";
import { isImageMime } from "@/utils/attachmentFormat";
import { getUserTextColor } from "@/utils/userColor";
import { t } from "./i18n";

interface Props {
  uuid: string;
}

type State =
  { status: "loading" } | { status: "unavailable" } | { status: "ready"; data: EmbedData };

const SHORTCODE_RE = /:([a-z0-9_-]{2,32}):/g;

function isInsideCode(node: Node): boolean {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === "CODE" || parent.tagName === "PRE") return true;
  }
  return false;
}

function buildEmojiImg(shortcode: string, url: string): HTMLImageElement {
  const img = document.createElement("img");
  img.setAttribute("src", url);
  img.setAttribute("alt", shortcode);
  img.setAttribute("title", shortcode);
  img.setAttribute("class", "embed-emoji");
  img.setAttribute("loading", "lazy");
  img.setAttribute("decoding", "async");
  return img;
}

function replaceShortcodesInTextNode(textNode: Text, emojiByShortcode: Map<string, string>): void {
  const text = textNode.textContent ?? "";
  SHORTCODE_RE.lastIndex = 0;
  const replacement: Node[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SHORTCODE_RE.exec(text)) !== null) {
    const url = emojiByShortcode.get(match[0]);
    if (!url) continue;
    if (match.index > lastIndex) {
      replacement.push(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    replacement.push(buildEmojiImg(match[0], url));
    lastIndex = match.index + match[0].length;
  }
  if (replacement.length === 0) return;
  if (lastIndex < text.length) {
    replacement.push(document.createTextNode(text.slice(lastIndex)));
  }
  textNode.replaceWith(...replacement);
}

function renderBodyHtml(text: string | null, emojiByShortcode: Map<string, string>): string {
  const sanitized = sanitizeMessageHtml(text ?? "");
  if (emojiByShortcode.size === 0) return sanitized;

  const container = document.createElement("div");
  container.innerHTML = sanitized;
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!isInsideCode(node)) textNodes.push(node as Text);
  }
  for (const textNode of textNodes) {
    replaceShortcodesInTextNode(textNode, emojiByShortcode);
  }
  return container.innerHTML;
}

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ReplyIcon() {
  return (
    <svg
      className="embed-icon"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg
      className="embed-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function VideoThumb({ src }: { src: string }) {
  const [duration, setDuration] = useState<number | null>(null);
  return (
    <>
      <video
        src={src}
        className="embed-attachment-image"
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
      />
      <span className="embed-video-overlay">
        <span className="embed-video-play">
          <svg width="12" height="14" viewBox="0 0 12 14" fill="#fff" aria-hidden="true">
            <path d="M0 0 L12 7 L0 14 Z" />
          </svg>
        </span>
      </span>
      {duration !== null && (
        <span className="embed-video-duration">{formatDuration(duration)}</span>
      )}
    </>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat(navigator.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function reportHeight(uuid: string): void {
  window.parent.postMessage(
    { type: "tyto-embed-height", uuid, height: document.documentElement.scrollHeight },
    "*",
  );
}

export function EmbedCard({ uuid }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEmbedData(uuid).then((data) => {
      if (cancelled) return;
      setState(data ? { status: "ready", data } : { status: "unavailable" });
    });
    return () => {
      cancelled = true;
    };
  }, [uuid]);

  useEffect(() => {
    reportHeight(uuid);
    const node = rootRef.current;
    if (typeof ResizeObserver === "undefined" || !node) return;
    const observer = new ResizeObserver(() => reportHeight(uuid));
    observer.observe(node);
    return () => observer.disconnect();
  }, [uuid, state]);

  const href = `${window.location.origin}/m/${uuid}`;

  let content: ReactNode;

  if (state.status === "loading") {
    content = (
      <div className="embed-card embed-card--loading" aria-busy="true">
        <div className="embed-skeleton-avatar" />
        <div className="embed-skeleton-line" />
        <div className="embed-skeleton-line embed-skeleton-line--short" />
      </div>
    );
  } else if (state.status === "unavailable") {
    content = (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="embed-card embed-card--unavailable"
      >
        <span className="embed-unavailable-text">{t("unavailable")}</span>
      </a>
    );
  } else {
    const { message, communityName, emojiByShortcode } = state.data;
    const authorName = message.createdBy?.profile.name ?? "?";
    const avatarSrc = message.createdBy?.profile.avatar?.contentUrl?.sm ?? null;
    const bodyHtml = renderBodyHtml(message.text, emojiByShortcode);

    const attachments = message.attachments ?? [];
    const isMedia = (a: (typeof attachments)[number]) =>
      (isImageMime(a.mimeType) || a.mimeType?.startsWith("video/")) && !!a.contentUrl;
    const media = attachments.filter(isMedia);
    const nonMedia = attachments.filter((a) => !isMedia(a));
    const visibleMedia = media.slice(0, 2);
    const extraMediaCount = media.length - visibleMedia.length;

    const reactionEntries = Object.entries(message.reactions ?? {});
    const replyCount = message.replyCount ?? 0;

    content = (
      <a href={href} target="_blank" rel="noopener noreferrer" className="embed-card">
        <div className="embed-header">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="embed-avatar" />
          ) : (
            <div className="embed-avatar embed-avatar-fallback">
              <span className="embed-avatar-initial">{authorName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="embed-header-text">
            <span
              className="embed-author"
              style={{ color: getUserTextColor(message.createdBy?.profile["@id"]) }}
            >
              {authorName}
            </span>
            <span className="embed-timestamp">{formatTimestamp(message.createdAt)}</span>
          </div>
        </div>

        <div className="embed-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

        {visibleMedia.length > 0 && (
          <div className="embed-attachments">
            {visibleMedia.map((attachment, index) => (
              <div key={attachment["@id"]} className="embed-attachment-image-wrap">
                {attachment.mimeType?.startsWith("video/") ? (
                  <VideoThumb src={attachment.contentUrl!} />
                ) : (
                  <img
                    src={attachment.contentUrl ?? undefined}
                    alt={attachment.originalName || t("image")}
                    className="embed-attachment-image"
                  />
                )}
                {index === visibleMedia.length - 1 && extraMediaCount > 0 && (
                  <span className="embed-attachment-more">+{extraMediaCount}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {nonMedia.length > 0 && (
          <div className="embed-attachment-badge">
            <PaperclipIcon /> {nonMedia.length}
          </div>
        )}

        {reactionEntries.length > 0 && (
          <div className="embed-reactions">
            {reactionEntries.map(([key, entries]) => {
              const emojiUrl =
                key.startsWith(":") && key.endsWith(":") ? emojiByShortcode.get(key) : undefined;
              return (
                <span key={key} className="embed-reaction-pill">
                  {emojiUrl ? (
                    <img src={emojiUrl} alt={key} title={key} className="embed-reaction-emoji" />
                  ) : (
                    <span>{key}</span>
                  )}
                  {entries.length > 1 && (
                    <span className="embed-reaction-count">{entries.length}</span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {replyCount > 0 && (
          <div className="embed-replies">
            <ReplyIcon /> {t(replyCount === 1 ? "replies_one" : "replies_other", replyCount)}
          </div>
        )}

        <div className="embed-label">
          #{message.channelIdentifier} · {communityName}
        </div>

        <div className="embed-footer">tyto.chat</div>
      </a>
    );
  }

  return (
    <div ref={rootRef} className="embed-root">
      {content}
    </div>
  );
}
