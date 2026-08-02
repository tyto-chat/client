import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { TextInput } from "@/components/TextInput";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Spinner, UploadIcon, TrashIcon } from "@/components/icons";
import {
  useCommunityEmojis,
  useDeleteCommunityEmoji,
  useUploadCustomEmoji,
} from "@/queries/communityEmojiQueries";
import { useNotification } from "@/context/NotificationContext";
import { useImageValidation } from "@/hooks/useImageValidation";
import type { CommunityEmoji } from "@/types/api";
import { ApiError } from "@/api/client";

const SHORTCODE_RE = /^:[a-z0-9_-]{2,32}:$/;

interface Props {
  communityIdentifier: string;
}

function renderEmoji(emoji: CommunityEmoji): React.ReactNode {
  if (emoji.image?.contentUrl) {
    return (
      <img
        src={emoji.image.contentUrl}
        alt={emoji.shortcode}
        className="h-6 w-6 object-contain"
        loading="lazy"
      />
    );
  }
  return <span className="text-xl">{emoji.shortcode}</span>;
}

export function EmojiManagerPanel({ communityIdentifier }: Props) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const { data: emojis, isLoading } = useCommunityEmojis(communityIdentifier);
  const uploadCustom = useUploadCustomEmoji(communityIdentifier);
  const deleteEmoji = useDeleteCommunityEmoji(communityIdentifier);
  const { validateImage, getLimits } = useImageValidation("community_emoji");
  const emojiLimits = getLimits();
  const acceptAttr =
    emojiLimits.allowedMimes && emojiLimits.allowedMimes.length > 0
      ? emojiLimits.allowedMimes.join(",")
      : "image/png,image/webp,image/gif";

  const [customShortcode, setCustomShortcode] = useState("::");
  const [customName, setCustomName] = useState("");
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [customError, setCustomError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<CommunityEmoji | null>(null);

  const customPreviewUrl = useMemo(
    () => (customFile ? URL.createObjectURL(customFile) : null),
    [customFile],
  );
  useEffect(() => {
    if (!customPreviewUrl) return;
    return () => URL.revokeObjectURL(customPreviewUrl);
  }, [customPreviewUrl]);

  function handleShortcodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const caret = input.selectionStart ?? input.value.length;
    const inner = input.value.replace(/:/g, "").toLowerCase();
    const next = `:${inner}:`;
    setCustomShortcode(next);

    requestAnimationFrame(() => {
      const desired = Math.min(Math.max(caret, 1), next.length - 1);
      input.setSelectionRange(desired, desired);
    });
  }

  function handleShortcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const len = input.value.length;
    if (e.key === "Backspace" && start === end && start <= 1) e.preventDefault();
    if (e.key === "Delete" && start === end && end >= len - 1) e.preventDefault();
    if (e.key === "ArrowLeft" && start === end && start <= 1) e.preventDefault();
    if (e.key === "ArrowRight" && start === end && end >= len - 1) e.preventDefault();
    if (e.key === "Home") {
      e.preventDefault();
      input.setSelectionRange(1, 1);
    }
    if (e.key === "End") {
      e.preventDefault();
      input.setSelectionRange(len - 1, len - 1);
    }
  }

  function clampShortcodeSelection(e: React.SyntheticEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const len = input.value.length;
    if (len < 2) return;
    const min = 1;
    const max = len - 1;
    const start = input.selectionStart ?? min;
    const end = input.selectionEnd ?? min;
    const clampedStart = Math.min(Math.max(start, min), max);
    const clampedEnd = Math.min(Math.max(end, min), max);
    if (clampedStart !== start || clampedEnd !== end) {
      input.setSelectionRange(clampedStart, clampedEnd);
    }
  }

  function handleShortcodeFocus(e: React.FocusEvent<HTMLInputElement>) {
    const input = e.target;
    const len = input.value.length;
    requestAnimationFrame(() => input.setSelectionRange(1, Math.max(1, len - 1)));
  }

  async function handleUploadCustom(e: React.FormEvent) {
    e.preventDefault();
    setCustomError("");
    const shortcode = customShortcode;
    if (!SHORTCODE_RE.test(shortcode)) {
      setCustomError(t("emoji_shortcode_format_error"));
      return;
    }
    if (!customFile) {
      setCustomError(t("emoji_file_required"));
      return;
    }
    const validationError = await validateImage(customFile);
    if (validationError) {
      setCustomError(validationError);
      return;
    }
    try {
      await uploadCustom.mutateAsync({
        file: customFile,
        shortcode,
        name: customName.trim() === "" ? null : customName.trim(),
      });
      setCustomShortcode("::");
      setCustomName("");
      setCustomFile(null);
      notify(t("emoji_added"), "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setCustomError(t("emoji_upload_invalid"));
      } else {
        setCustomError(t("emoji_upload_failed"));
      }
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteEmoji.mutateAsync(pendingDelete.id);
      notify(t("emoji_deleted"), "success");
    } catch {
      notify(t("emoji_delete_failed"), "error");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg">{t("emoji_list_heading")}</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size={20} />
            </div>
          ) : !emojis || emojis.length === 0 ? (
            <p className="text-sm text-fg-muted">{t("emoji_list_empty")}</p>
          ) : (
            <ul className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {emojis.map((emoji) => (
                <li
                  key={emoji.id}
                  className="flex items-center justify-between gap-2 rounded bg-canvas ring-1 ring-inset ring-line px-2 py-1"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {renderEmoji(emoji)}
                    <div className="flex min-w-0 flex-col leading-tight">
                      <code className="truncate text-xs text-fg">{emoji.shortcode}</code>
                      {emoji.name && (
                        <span className="truncate text-[0.625rem] text-fg-subtle">
                          {emoji.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setPendingDelete(emoji)}
                    title={t("emoji_delete")}
                    className="text-fg-subtle transition-colors hover:text-red-500"
                  >
                    <TrashIcon size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg">{t("emoji_upload_custom_heading")}</h3>
          <form onSubmit={handleUploadCustom} className="space-y-2">
            <TextInput
              label={t("emoji_shortcode_label")}
              placeholder=":tyto:"
              value={customShortcode}
              onChange={handleShortcodeChange}
              onKeyDown={handleShortcodeKeyDown}
              onFocus={handleShortcodeFocus}
              onClick={clampShortcodeSelection}
              onSelect={clampShortcodeSelection}
              required
            />
            <TextInput
              label={t("emoji_name_label", { defaultValue: "Name (optional)" })}
              placeholder={t("emoji_name_placeholder", { defaultValue: "Party Parrot" })}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              maxLength={64}
            />
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded bg-canvas ring-1 ring-inset ring-line px-3 py-1 text-sm hover:bg-surface">
                <UploadIcon size={14} />
                <span>{customFile ? customFile.name : t("emoji_choose_file")}</span>
                <input
                  type="file"
                  accept={acceptAttr}
                  className="hidden"
                  onChange={(e) => setCustomFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {customPreviewUrl && (
                <div
                  title={t("emoji_preview_title", { defaultValue: "Final size preview" })}
                  style={{ width: emojiLimits.maxWidth, height: emojiLimits.maxHeight }}
                  className="flex flex-none items-center justify-center rounded border border-dashed border-line bg-surface"
                >
                  <img
                    src={customPreviewUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-fg-muted">
              {t("emoji_limits_hint", {
                defaultValue: "Max {{size}}, resized to {{w}}×{{h}}px. Types: {{types}}.",
                size: `${(emojiLimits.maxSize / (1024 * 1024)).toFixed(1)} MB`,
                w: emojiLimits.maxWidth,
                h: emojiLimits.maxHeight,
                types: emojiLimits.allowedMimes?.join(", ") ?? "image/*",
              })}
            </p>
            <ErrorMessage message={customError} />
            <button
              type="submit"
              disabled={uploadCustom.isPending}
              className="block rounded bg-accent-gradient px-3 py-1 text-sm text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {uploadCustom.isPending ? t("common:saving") : t("emoji_upload_button")}
            </button>
          </form>
        </section>
      </div>
      {pendingDelete && (
        <Modal
          title={t("emoji_delete_confirm_title", { defaultValue: "Delete emoji?" })}
          onClose={() => setPendingDelete(null)}
          size="sm"
        >
          {(close) => (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {pendingDelete.image?.contentUrl ? (
                  <img
                    src={pendingDelete.image.contentUrl}
                    alt={pendingDelete.shortcode}
                    className="h-10 w-10 object-contain"
                  />
                ) : (
                  <code className="text-sm">{pendingDelete.shortcode}</code>
                )}
                <code className="text-sm text-fg">{pendingDelete.shortcode}</code>
              </div>
              <p className="text-sm text-fg">
                {t("emoji_delete_confirm_body", {
                  defaultValue:
                    "Existing reactions using this emoji will also be removed. This cannot be undone.",
                })}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={deleteEmoji.isPending}
                  className="rounded px-3 py-1 text-sm text-fg-muted transition-colors hover:bg-surface"
                >
                  {t("common:cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void confirmDelete();
                    close();
                  }}
                  disabled={deleteEmoji.isPending}
                  className="rounded bg-red-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-60"
                >
                  {deleteEmoji.isPending
                    ? t("common:saving")
                    : t("emoji_delete_confirm_button", { defaultValue: "Delete" })}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
