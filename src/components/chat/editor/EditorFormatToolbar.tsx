import { useEffect, useReducer } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { ToolbarButton, MoreItem, Divider } from "./ToolbarButton";
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  CodeIcon,
  ListIcon,
  EllipsisIcon,
  UnderlineIcon,
  QuoteIcon,
  Heading1Icon,
  Heading2Icon,
  ListOrderedIcon,
} from "@/components/icons";

export function EditorFormatToolbar({
  editor,
  showMore,
  setShowMore,
  moreRef,
}: {
  editor: Editor | null;
  showMore: boolean;
  setShowMore: React.Dispatch<React.SetStateAction<boolean>>;
  moreRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation(["channel"]);

  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", forceRender);
    editor.on("selectionUpdate", forceRender);
    return () => {
      editor.off("transaction", forceRender);
      editor.off("selectionUpdate", forceRender);
    };
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1">
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        isActive={editor?.isActive("bold")}
        title={t("channel:editor_bold")}
      >
        <BoldIcon size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        isActive={editor?.isActive("italic")}
        title={t("channel:editor_italic")}
      >
        <ItalicIcon size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleStrike().run()}
        isActive={editor?.isActive("strike")}
        title={t("channel:editor_strikethrough")}
      >
        <StrikethroughIcon size={16} />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleCode().run()}
        isActive={editor?.isActive("code")}
        title={t("channel:editor_inline_code")}
      >
        <CodeIcon size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        isActive={editor?.isActive("bulletList")}
        title={t("channel:editor_bullet_list")}
      >
        <ListIcon size={16} />
      </ToolbarButton>
      <Divider />
      <div className="relative" ref={moreRef}>
        <ToolbarButton
          onClick={() => setShowMore((v) => !v)}
          isActive={
            showMore ||
            editor?.isActive("underline") ||
            editor?.isActive("blockquote") ||
            editor?.isActive("codeBlock") ||
            editor?.isActive("heading", { level: 1 }) ||
            editor?.isActive("heading", { level: 2 }) ||
            editor?.isActive("orderedList")
          }
          title={t("channel:editor_more_formatting")}
        >
          <EllipsisIcon size={16} />
        </ToolbarButton>
        {showMore && (
          <div className="absolute bottom-full left-0 z-50 mb-2 min-w-44 rounded-lg border border-line bg-overlay py-1 shadow-soft-md">
            <MoreItem
              icon={<UnderlineIcon size={15} />}
              label={t("channel:editor_underline")}
              active={editor?.isActive("underline")}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            />
            <MoreItem
              icon={<QuoteIcon size={15} />}
              label={t("channel:editor_blockquote")}
              active={editor?.isActive("blockquote")}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            />
            <MoreItem
              icon={<CodeIcon size={15} />}
              label={t("channel:editor_code_block")}
              active={editor?.isActive("codeBlock")}
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            />
            <MoreItem
              icon={<Heading1Icon size={15} />}
              label={t("channel:editor_heading_1")}
              active={editor?.isActive("heading", { level: 1 })}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            />
            <MoreItem
              icon={<Heading2Icon size={15} />}
              label={t("channel:editor_heading_2")}
              active={editor?.isActive("heading", { level: 2 })}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            />
            <MoreItem
              icon={<ListOrderedIcon size={15} />}
              label={t("channel:editor_numbered_list")}
              active={editor?.isActive("orderedList")}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
