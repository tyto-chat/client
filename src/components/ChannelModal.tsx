import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useCreateChannel, useDeleteChannel, useUpdateChannel } from "@/queries/channelQueries";
import { useCommunity } from "@/queries/communityQueries";
import { useNotification } from "@/context/NotificationContext";
import { sectionIri, toIri } from "@/api/hydra";
import { Modal } from "@/components/Modal";
import { TextInput } from "@/components/TextInput";
import { ModalFooter } from "@/components/ModalFooter";
import { ErrorMessage } from "@/components/ErrorMessage";
import { MicrophoneIcon } from "@/components/icons";
import { Select } from "@/components/ui";
import { useVoiceEnabled } from "@/hooks/useVoiceEnabled";
import type { Channel, ChannelSection } from "@/types/api";

type ChannelModalProps =
  | { mode: "create"; communityId: string; section: ChannelSection; onClose: () => void }
  | { mode: "edit"; communityId: string; channel: Channel; onClose: () => void };

export function ChannelModal(props: ChannelModalProps) {
  const { t } = useTranslation(["community", "channel", "common"]);
  const { communityId, onClose } = props;
  const isEdit = props.mode === "edit";

  const { notify } = useNotification();
  const navigate = useNavigate();
  const voiceEnabled = useVoiceEnabled();
  const createChannel = useCreateChannel(communityId);
  const updateChannel = useUpdateChannel(communityId);
  const deleteChannel = useDeleteChannel(communityId);
  const { data: community } = useCommunity(communityId);
  const sections = community?.channelSections ?? [];

  const [name, setName] = useState(isEdit ? props.channel.name : "");
  const [description, setDescription] = useState(isEdit ? (props.channel.description ?? "") : "");
  const [type, setType] = useState<"text" | "audio">(
    isEdit ? (props.channel.type ?? "text") : "text",
  );
  const [sectionId, setSectionId] = useState(isEdit ? props.channel.section.id : 0);
  const [isPrivate, setIsPrivate] = useState(isEdit ? (props.channel.isPrivate ?? false) : false);
  const [isReadonly, setIsReadonly] = useState(
    isEdit ? (props.channel.isReadonly ?? false) : false,
  );
  const [areReadonlyRepliesAllowed, setAreReadonlyRepliesAllowed] = useState(
    isEdit ? (props.channel.areReadonlyRepliesAllowed ?? false) : false,
  );
  const [allowAttachments, setAllowAttachments] = useState(
    isEdit ? (props.channel.allowAttachments ?? false) : false,
  );
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const isUnchanged =
    isEdit &&
    name === props.channel.name &&
    description === (props.channel.description ?? "") &&
    sectionId === props.channel.section.id &&
    isPrivate === (props.channel.isPrivate ?? false) &&
    isReadonly === (props.channel.isReadonly ?? false) &&
    areReadonlyRepliesAllowed === (props.channel.areReadonlyRepliesAllowed ?? false) &&
    allowAttachments === (props.channel.allowAttachments ?? false);

  const isPending = isEdit ? updateChannel.isPending : createChannel.isPending;

  async function handleSubmit(e: React.FormEvent, close: () => void) {
    e.preventDefault();
    setError("");
    try {
      if (isEdit) {
        const updated = await updateChannel.mutateAsync({
          channelId: props.channel.identifier,
          name: name !== props.channel.name ? name : undefined,
          description: description !== (props.channel.description ?? "") ? description : undefined,
          section:
            sectionId !== props.channel.section.id ? sectionIri(communityId, sectionId) : undefined,
          isPrivate: isPrivate !== (props.channel.isPrivate ?? false) ? isPrivate : undefined,
          isReadonly:
            type === "text" && isReadonly !== (props.channel.isReadonly ?? false)
              ? isReadonly
              : undefined,
          areReadonlyRepliesAllowed:
            type === "text" &&
            areReadonlyRepliesAllowed !== (props.channel.areReadonlyRepliesAllowed ?? false)
              ? areReadonlyRepliesAllowed
              : undefined,
          allowAttachments:
            type === "text" && allowAttachments !== (props.channel.allowAttachments ?? false)
              ? allowAttachments
              : undefined,
        });
        notify(t("channel_updated"), "success");
        if (name !== props.channel.name) {
          await navigate({
            to: "/$communityId/$channelId",
            params: { communityId, channelId: updated.identifier },
          });
        }
      } else {
        await createChannel.mutateAsync({
          name,
          community: toIri("communities", communityId),
          section: sectionIri(communityId, props.section.id),
          description: description || undefined,
          type,
          isPrivate: isPrivate || undefined,
          isReadonly: type === "text" ? isReadonly || undefined : undefined,
          areReadonlyRepliesAllowed:
            type === "text" && isReadonly ? areReadonlyRepliesAllowed || undefined : undefined,
        });
      }
      close();
    } catch {
      setError(isEdit ? t("channel:channel_update_error") : t("channel:channel_create_error"));
    }
  }

  async function handleDelete(close: () => void) {
    if (!isEdit) return;
    setError("");
    try {
      await deleteChannel.mutateAsync(props.channel.identifier);
      notify(t("channel:channel_deleted"), "success");
      close();
      await navigate({ to: "/$communityId", params: { communityId } });
    } catch {
      setError(t("channel:channel_delete_error"));
    }
  }

  const title = isEdit ? (
    t("edit_channel_title")
  ) : (
    <>
      {t("create_channel_title")}{" "}
      <span className="text-sm font-normal text-fg-muted">
        {props.mode === "create" ? t("create_channel_in", { section: props.section.name }) : ""}
      </span>
    </>
  );

  return (
    <Modal title={title} onClose={onClose}>
      {(close) => (
        <form onSubmit={(e) => handleSubmit(e, close)} className="space-y-4">
          <div className={`flex gap-2 ${voiceEnabled && !isEdit ? "" : "hidden"}`}>
            {(["text", "audio"] as const).map((channelType) => (
              <button
                key={channelType}
                type="button"
                onClick={() => setType(channelType)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-sm font-medium transition-colors ${
                  type === channelType
                    ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-text-on-light)] dark:bg-[var(--accent-dark)] dark:text-[var(--accent-text-dark)]"
                    : "border-line text-fg-muted hover:border-line-strong"
                }`}
              >
                {channelType === "audio" && <MicrophoneIcon size={14} />}
                {channelType === "text" ? t("channel_type_text") : t("channel_type_voice")}
              </button>
            ))}
          </div>
          <TextInput
            label={t("common:name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <TextInput
            label={
              <>
                {t("common:description")}{" "}
                <span className="text-fg-subtle">{t("common:optional")}</span>
              </>
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {isEdit && sections.length > 0 && (
            <Select
              label={t("section")}
              value={sectionId}
              onChange={(e) => setSectionId(Number(e.target.value))}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          <div className="space-y-3">
            <div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                {t("channel_private_label")}
              </label>
              <p className="mt-1 pl-6 text-xs text-fg-muted">{t("channel_private_hint")}</p>
            </div>
            {type === "text" && (
              <div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={isReadonly}
                    onChange={(e) => setIsReadonly(e.target.checked)}
                  />
                  {t("channel_readonly_label")}
                </label>
                <p className="mt-1 pl-6 text-xs text-fg-muted">{t("channel_readonly_hint")}</p>
                {isReadonly && (
                  <div className="mt-2 pl-6">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        checked={areReadonlyRepliesAllowed}
                        onChange={(e) => setAreReadonlyRepliesAllowed(e.target.checked)}
                      />
                      {t("channel_readonly_allow_replies_label")}
                    </label>
                    <p className="mt-1 pl-6 text-xs text-fg-muted">
                      {t("channel_readonly_allow_replies_hint")}
                    </p>
                  </div>
                )}
              </div>
            )}
            {type === "text" && (
              <div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={allowAttachments}
                    onChange={(e) => setAllowAttachments(e.target.checked)}
                  />
                  {t("channel_allow_attachments_label")}
                </label>
                <p className="mt-1 pl-6 text-xs text-fg-muted">
                  {t("channel_allow_attachments_hint")}
                </p>
              </div>
            )}
          </div>
          <ErrorMessage message={error} />
          <ModalFooter
            onCancel={close}
            submitLabel={isEdit ? t("common:save") : t("common:create")}
            pendingLabel={isEdit ? t("common:saving") : t("common:creating")}
            isPending={isPending}
            disabled={isEdit ? !name.trim() || isUnchanged : undefined}
          />
          {isEdit && (
            <div className="border-t border-line pt-4">
              {!confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="text-sm font-medium text-danger hover:underline"
                >
                  {t("channel:delete_channel")}
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-fg-muted">
                    {t("channel:delete_channel_warning", { name: props.channel.name })}
                  </p>
                  <TextInput
                    label={t("channel:delete_channel_confirm_hint", { name: props.channel.name })}
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={props.channel.name}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingDelete(false);
                        setDeleteConfirmName("");
                      }}
                      className="rounded-lg px-4 py-2 text-sm text-fg-muted hover:text-fg dark:hover:text-white"
                    >
                      {t("channel:delete_channel_keep")}
                    </button>
                    <button
                      type="button"
                      disabled={deleteConfirmName !== props.channel.name || deleteChannel.isPending}
                      onClick={() => handleDelete(close)}
                      className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger/90 disabled:opacity-40"
                    >
                      {t("channel:delete_channel_confirm")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}

export function EditChannelModal({
  channel,
  communityId,
  onClose,
}: {
  channel: Channel;
  communityId: string;
  onClose: () => void;
}) {
  return <ChannelModal mode="edit" channel={channel} communityId={communityId} onClose={onClose} />;
}
