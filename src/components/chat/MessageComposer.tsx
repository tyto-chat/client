import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import { htmlToMarkdown, markdownToHtml } from "@/utils/markdownConverter";
import { UnifiedEmojiPicker } from "@/components/chat/UnifiedEmojiPicker";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { lowlight } from "@/utils/lowlight";
import { CodeBlockComponent } from "./CodeBlockComponent";
import { useSubmitKey } from "@/context/SubmitKeyContext";
import { createChannelMentionExtension } from "@/utils/channelMentionExtension";
import {
  createUserMentionExtension,
  isBroadcastItem,
  type BroadcastItem,
  type MemberItem,
  type UserSuggestionItem,
} from "@/utils/userMentionExtension";
import {
  createEmojiAutocompleteExtension,
  exitEmojiSuggestion,
  type EmojiSuggestionItem,
} from "@/utils/emojiAutocompleteExtension";
import { warmCatalogue } from "@/utils/emojiCatalog";
import { createEmojiDecoratorExtension } from "@/utils/emojiDecoratorExtension";
import { createEmoticonExtension } from "@/utils/emoticonExtension";
import { useUserPreferences } from "@/queries/userPreferencesQueries";
import { emptySuggestionState, type SuggestionState } from "@/utils/mentionSuggestion";
import { useCommunityEmojis } from "@/queries/communityEmojiQueries";
import { usePresenceSubscription } from "@/queries/presenceQueries";
import { useTypingPing } from "@/hooks/useTypingPing";
import { usePendingAttachments } from "@/hooks/usePendingAttachments";
import { Avatar } from "@/components/Avatar";
import { MegaphoneIcon, PaperclipIcon, SendIcon, SmileIcon } from "@/components/icons";
import { ToolbarButton } from "./editor/ToolbarButton";
import { SuggestionDropdown } from "./editor/SuggestionDropdown";
import { EditorFormatToolbar } from "./editor/EditorFormatToolbar";
import { AttachmentPreviewStrip } from "./editor/AttachmentPreviewStrip";
import { filesFromClipboard, filesFromDrop, toFileList } from "@/utils/clipboardFiles";

export interface MessageEditorProps {
  onSend: (markdown: string, attachmentIris?: string[]) => void | Promise<unknown>;
  isPending?: boolean;
  placeholder?: string;
  initialContent?: string;
  onCancel?: () => void;
  channels?: Array<{ name: string; identifier: string }>;
  members?: MemberItem[];
  canBroadcast?: boolean;
  allowAttachments?: boolean;
  communityId?: string;
  channelIdentifier?: string;
  conversationIdentifier?: string;
}

function MessageComposer({
  onSend,
  isPending,
  placeholder,
  initialContent,
  onCancel,
  channels,
  members,
  canBroadcast,
  allowAttachments,
  communityId,
  channelIdentifier,
  conversationIdentifier,
}: MessageEditorProps) {
  const { t } = useTranslation(["common", "channel"]);
  const isEditMode = onCancel !== undefined;
  const {
    pendingAttachments,
    pendingAttachmentsRef,
    setPendingAttachments,
    handleFiles,
    removeAttachment,
    getLimits,
  } = usePendingAttachments({ communityId, channelIdentifier, conversationIdentifier });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialHtml = useMemo(
    () => (initialContent ? markdownToHtml(initialContent) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [isEmpty, setIsEmpty] = useState(!initialContent);
  const [focused, setFocused] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const expanded = focused || !isEmpty || isEditMode || showPicker || pendingAttachments.length > 0;
  const [channelSuggestion, setChannelSuggestion] =
    useState<SuggestionState<{ name: string; identifier: string }>>(emptySuggestionState());
  const [userSuggestion, setUserSuggestion] =
    useState<SuggestionState<UserSuggestionItem>>(emptySuggestionState());
  const [emojiSuggestion, setEmojiSuggestion] =
    useState<SuggestionState<EmojiSuggestionItem>>(emptySuggestionState());

  useEffect(() => {
    warmCatalogue();
  }, []);

  const mentionPresenceIds = useMemo(
    () =>
      userSuggestion.visible
        ? userSuggestion.items
            .filter(
              (i): i is Exclude<UserSuggestionItem, { broadcast: unknown }> => !isBroadcastItem(i),
            )
            .map((m) => m.id)
        : [],
    [userSuggestion.visible, userSuggestion.items],
  );
  usePresenceSubscription(mentionPresenceIds);
  const notifyTyping = useTypingPing({ communityId, channelIdentifier, conversationIdentifier });
  const { data: communityEmojis } = useCommunityEmojis(communityId);
  const { data: userPrefs } = useUserPreferences();
  const pickerRef = useRef<HTMLDivElement>(null);
  const emojiDropdownRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const { submitKey } = useSubmitKey();

  useClickOutside(pickerRef, () => setShowPicker(false), showPicker);
  useClickOutside(moreRef, () => setShowMore(false), showMore);

  const sendRef = useRef<() => void>(() => {});
  const onCancelRef = useRef(onCancel);
  const submitKeyRef = useRef(submitKey);
  const channelsRef = useRef(channels ?? []);
  const membersRef = useRef(members ?? []);
  const broadcastsRef = useRef<BroadcastItem[]>([]);
  const communityEmojisRef = useRef(communityEmojis ?? []);
  const suggestionActiveRef = useRef(false);
  const handleFilesRef = useRef<(files: FileList) => void>(() => {});
  const allowAttachmentsRef = useRef(allowAttachments ?? false);
  const convertEmoticonsRef = useRef(userPrefs?.convertEmoticons ?? true);
  const placeholderRef = useRef(placeholder);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockComponent);
        },
      }).configure({ lowlight }),
      /* eslint-disable react-hooks/refs -- the extension factories only store
         these refs and dereference them at event time (keystrokes), never
         during render */
      Placeholder.configure({ placeholder: () => placeholderRef.current ?? "" }),
      createChannelMentionExtension(channelsRef, setChannelSuggestion),
      createUserMentionExtension(membersRef, broadcastsRef, setUserSuggestion),
      createEmojiAutocompleteExtension(communityEmojisRef, setEmojiSuggestion),
      createEmojiDecoratorExtension(communityEmojisRef),
      createEmoticonExtension(convertEmoticonsRef),
      /* eslint-enable react-hooks/refs */
    ],
    content: initialHtml,
    onUpdate: ({ editor }) => {
      setIsEmpty(editor.isEmpty);
      if (!editor.isEmpty) notifyTyping();
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": placeholder ?? t("common:message"),
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape" && onCancelRef.current) {
          onCancelRef.current();
          return true;
        }
        const key = submitKeyRef.current;
        const isEnter = event.key === "Enter";
        if (!isEnter) return false;
        if (suggestionActiveRef.current) return false;
        const matches =
          (key === "enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) ||
          (key === "shift+enter" && event.shiftKey) ||
          (key === "ctrl+enter" && (event.ctrlKey || event.metaKey));
        if (matches) {
          event.preventDefault();
          sendRef.current();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        if (!allowAttachmentsRef.current) return false;
        const files = filesFromClipboard(event);
        if (files.length === 0) return false;
        event.preventDefault();
        handleFilesRef.current(toFileList(files));
        return true;
      },
      handleDrop: (_view, event) => {
        if (!allowAttachmentsRef.current) return false;
        const files = filesFromDrop(event);
        if (files.length === 0) return false;
        event.preventDefault();
        handleFilesRef.current(toFileList(files));
        return true;
      },
    },
  });

  useEffect(() => {
    placeholderRef.current = placeholder;
    if (editor && editor.isEmpty) {
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, placeholder]);

  useEffect(() => {
    onCancelRef.current = onCancel;
    submitKeyRef.current = submitKey;
    channelsRef.current = channels ?? [];
    membersRef.current = members ?? [];
    broadcastsRef.current = canBroadcast
      ? [
          { broadcast: "channel", name: "channel" },
          { broadcast: "here", name: "here" },
        ]
      : [];
    communityEmojisRef.current = communityEmojis ?? [];
    convertEmoticonsRef.current = userPrefs?.convertEmoticons ?? true;
    suggestionActiveRef.current =
      channelSuggestion.visible || userSuggestion.visible || emojiSuggestion.visible;
    handleFilesRef.current = (files: FileList) => void handleFiles(files);
    allowAttachmentsRef.current = allowAttachments ?? false;
    sendRef.current = () => {
      const attachmentIris = pendingAttachmentsRef.current
        .filter((a) => a.iri !== null)
        .map((a) => a.iri as string);
      if (!editor || (editor.isEmpty && attachmentIris.length === 0)) return;
      const savedHtml = editor.getHTML();
      const savedAttachments = pendingAttachmentsRef.current;
      const result = onSend(
        htmlToMarkdown(savedHtml),
        attachmentIris.length > 0 ? attachmentIris : undefined,
      );
      if (isEditMode) return;
      editor.commands.clearContent(true);
      editor.commands.focus();
      setPendingAttachments([]);
      pendingAttachmentsRef.current = [];
      void Promise.resolve(result).catch(() => {
        editor.commands.setContent(savedHtml);
        editor.commands.focus();
        setPendingAttachments(savedAttachments);
        pendingAttachmentsRef.current = savedAttachments;
      });
    };
  });

  useEffect(() => {
    if (!emojiSuggestion.visible || !editor) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (emojiDropdownRef.current?.contains(target)) return;
      if (editor?.view.dom.contains(target)) return;
      exitEmojiSuggestion(editor!.view);
      setEmojiSuggestion((prev) => ({ ...prev, visible: false }));
    }
    document.addEventListener("mousedown", onPointerDown, true);
    return () => document.removeEventListener("mousedown", onPointerDown, true);
  }, [emojiSuggestion.visible, editor]);

  return (
    <div className="flex items-center gap-2">
      <SuggestionDropdown
        suggestion={channelSuggestion}
        getKey={(ch) => ch.identifier}
        emptyMessage="No channels found"
        renderItem={(ch) => <>#{ch.name}</>}
      />
      <SuggestionDropdown
        suggestion={userSuggestion}
        getKey={(m) => (isBroadcastItem(m) ? `broadcast:${m.broadcast}` : String(m.id))}
        getTestId={(m) => (isBroadcastItem(m) ? `mention-option-${m.broadcast}` : undefined)}
        emptyMessage="No users found"
        widthClass="w-72"
        getGroup={(m) => (isBroadcastItem(m) ? "broadcast" : "members")}
        groupLabels={{
          broadcast: t("channel:mention_section_broadcast"),
          members: t("channel:mention_section_members"),
        }}
        renderItem={(m) =>
          isBroadcastItem(m) ? (
            <span className="flex items-center gap-2.5">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <MegaphoneIcon size={13} />
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="font-semibold">@{m.broadcast}</span>
                <span className="truncate text-xs text-fg-muted">
                  {t(`channel:broadcast_hint_${m.broadcast}`)}
                </span>
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Avatar
                name={m.name}
                colorKey={m.colorKey}
                imageUrl={m.avatarUrl}
                size="xs"
                userId={m.id}
              />
              {m.name}
            </span>
          )
        }
      />
      <SuggestionDropdown
        rootRef={emojiDropdownRef}
        suggestion={emojiSuggestion}
        getKey={(e) => e.key}
        emptyMessage="No emoji found"
        renderItem={(e) => (
          <span className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center text-base">
              {e.imageUrl ? (
                <img
                  src={e.imageUrl}
                  alt={e.label}
                  className="h-5 w-5 object-contain"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                (e.glyph ?? e.label)
              )}
            </span>
            <span className="truncate">{e.label}</span>
          </span>
        )}
      />
      {allowAttachments && !isEditMode && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={getLimits().allowedMimes.join(",")}
          aria-label={t("channel:attach_file")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      )}
      <div className="flex-1 rounded-xl bg-surface ring-1 ring-inset ring-line transition focus-within:ring-line-strong">
        {expanded && (
          <EditorFormatToolbar
            editor={editor}
            showMore={showMore}
            setShowMore={setShowMore}
            moreRef={moreRef}
          />
        )}

        <div className="flex items-center gap-2 pr-2">
          <div
            className={`min-w-0 flex-1 cap-trim overflow-y-auto px-3.5 text-sm text-fg ${
              expanded ? "py-2.5" : "py-3.5"
            }`}
            style={{ maxHeight: "6rem" }}
          >
            <EditorContent editor={editor} />
          </div>
          {!expanded && !isEditMode && (
            <button
              type="button"
              onClick={() => sendRef.current()}
              aria-label={t("common:send")}
              title={t("common:send")}
              disabled={
                (isEmpty && pendingAttachments.every((a) => a.iri === null)) ||
                isPending ||
                pendingAttachments.some((a) => a.uploading)
              }
              className="mb-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-gradient text-on-accent shadow-glow transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
            >
              <SendIcon size={16} />
            </button>
          )}
        </div>
        <AttachmentPreviewStrip attachments={pendingAttachments} onRemove={removeAttachment} />
        {expanded && (
          <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
            {allowAttachments && !isEditMode && (
              <ToolbarButton
                onClick={() => fileInputRef.current?.click()}
                title={t("channel:attach_file")}
              >
                <PaperclipIcon size={16} />
              </ToolbarButton>
            )}
            <div className="relative" ref={pickerRef}>
              <ToolbarButton
                onClick={() => setShowPicker((v) => !v)}
                isActive={showPicker}
                title={t("channel:editor_emoji")}
              >
                <SmileIcon size={16} />
              </ToolbarButton>
              {showPicker && (
                <div className="absolute bottom-full left-0 z-50 mb-2">
                  <UnifiedEmojiPicker
                    communityIdentifier={communityId}
                    onPick={(value) => {
                      editor?.chain().focus().insertContent(value).run();
                      setShowPicker(false);
                    }}
                  />
                </div>
              )}
            </div>
            {!isEditMode && (
              <button
                type="button"
                onClick={() => sendRef.current()}
                aria-label={t("common:send")}
                title={t("common:send")}
                disabled={
                  (isEmpty && pendingAttachments.every((a) => a.iri === null)) ||
                  isPending ||
                  pendingAttachments.some((a) => a.uploading)
                }
                className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-gradient text-on-accent shadow-glow transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
              >
                <SendIcon size={16} />
              </button>
            )}
            {isEditMode && (
              <p className="ml-auto pr-1 text-xs text-fg-subtle">
                Esc to cancel · Ctrl+Enter to save
              </p>
            )}
          </div>
        )}
      </div>

      {isEditMode && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            data-testid="msg-edit-save-btn"
            onClick={() => sendRef.current()}
            disabled={isEmpty || isPending}
            className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-glow hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-fg-muted hover:bg-raised"
          >
            {t("common:cancel")}
          </button>
        </div>
      )}
    </div>
  );
}

export default MessageComposer;
