import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAttachmentValidation } from "@/hooks/useAttachmentValidation";
import { useNotification } from "@/context/NotificationContext";
import {
  deleteAttachment,
  uploadAttachment,
  uploadConversationAttachment,
} from "@/api/attachments";
import { isRateLimited } from "@/api/client";

export type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string | null;
  iri: string | null;
  uploading: boolean;
  progress: number;
  error: string | null;
};

export function usePendingAttachments({
  communityId,
  channelIdentifier,
  conversationIdentifier,
}: {
  communityId?: string;
  channelIdentifier?: string;
  conversationIdentifier?: string;
}) {
  const { t } = useTranslation(["channel"]);
  const { notify } = useNotification();
  const { validateAttachment, getLimits } = useAttachmentValidation();

  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const pendingAttachmentsRef = useRef(pendingAttachments);
  // eslint-disable-next-line react-hooks/refs
  pendingAttachmentsRef.current = pendingAttachments;

  async function handleFiles(files: FileList) {
    const isChannel = !!communityId && !!channelIdentifier;
    const isConversation = !!conversationIdentifier;
    if (!isChannel && !isConversation) return;
    const { attachmentMaxPerMessage } = getLimits();
    const maxPerMessage = attachmentMaxPerMessage;
    const slots = maxPerMessage - pendingAttachmentsRef.current.length;
    const toAdd = Array.from(files).slice(0, slots);

    for (const file of toAdd) {
      const error = validateAttachment(file);
      if (error) {
        notify(error, "error");
        continue;
      }
      const id = `${Date.now()}-${Math.random()}`;
      const previewUrl =
        file.type.startsWith("image/") || file.type.startsWith("video/")
          ? URL.createObjectURL(file)
          : null;
      setPendingAttachments((prev) => [
        ...prev,
        { id, file, previewUrl, iri: null, uploading: true, progress: 0, error: null },
      ]);
      try {
        const onProgress = (pct: number) => {
          setPendingAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, progress: pct } : a)),
          );
        };
        const attachment = isChannel
          ? await uploadAttachment(communityId!, channelIdentifier!, file, onProgress)
          : await uploadConversationAttachment(conversationIdentifier!, file, onProgress);
        setPendingAttachments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, iri: attachment["@id"], uploading: false, progress: 100 } : a,
          ),
        );
      } catch (err) {
        if (isRateLimited(err)) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
          notify(t("channel:attachment_upload_rate_limited"), "error");
          break;
        }
        setPendingAttachments((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, uploading: false, error: t("channel:attachment_upload_failed") }
              : a,
          ),
        );
      }
    }
  }

  function removeAttachment(id: string) {
    const found = pendingAttachmentsRef.current.find((a) => a.id === id);
    if (found?.iri) {
      void deleteAttachment(found.iri).catch(() => {});
    }
    if (found?.previewUrl) {
      URL.revokeObjectURL(found.previewUrl);
    }
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
  }, []);

  return {
    pendingAttachments,
    pendingAttachmentsRef,
    setPendingAttachments,
    handleFiles,
    removeAttachment,
    getLimits,
  };
}
