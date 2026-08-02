import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateSection, useUpdateSection } from "@/queries/channelQueries";
import { useNotification } from "@/context/NotificationContext";
import { Modal } from "@/components/Modal";
import { TextInput } from "@/components/TextInput";
import { ModalFooter } from "@/components/ModalFooter";
import { ErrorMessage } from "@/components/ErrorMessage";
import type { ChannelSection } from "@/types/api";

type SectionModalProps =
  | { mode: "create"; communityId: string; onClose: () => void }
  | { mode: "edit"; communityId: string; section: ChannelSection; onClose: () => void };

export function SectionModal(props: SectionModalProps) {
  const { t } = useTranslation(["community", "common"]);
  const { communityId, onClose } = props;
  const { notify } = useNotification();
  const createSection = useCreateSection(communityId);
  const updateSection = useUpdateSection(communityId);
  const [name, setName] = useState(props.mode === "edit" ? props.section.name : "");
  const [error, setError] = useState("");

  const isPending = props.mode === "create" ? createSection.isPending : updateSection.isPending;

  async function handleSubmit(e: React.FormEvent, close: () => void) {
    e.preventDefault();
    setError("");
    try {
      if (props.mode === "create") {
        await createSection.mutateAsync({ name });
      } else {
        await updateSection.mutateAsync({
          id: props.section.id,
          name: name !== props.section.name ? name : undefined,
        });
        notify(t("section_updated"), "success");
      }
      close();
    } catch {
      setError(props.mode === "create" ? t("section_create_error") : t("section_update_error"));
    }
  }

  const isCreate = props.mode === "create";

  return (
    <Modal title={isCreate ? t("create_section_title") : t("edit_section_title")} onClose={onClose}>
      {(close) => (
        <form onSubmit={(e) => handleSubmit(e, close)} className="space-y-4">
          <TextInput
            label={t("common:name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <ErrorMessage message={error} />
          <ModalFooter
            onCancel={close}
            submitLabel={isCreate ? t("common:create") : t("common:save")}
            pendingLabel={isCreate ? t("common:creating") : t("common:saving")}
            isPending={isPending}
            disabled={
              props.mode === "edit" ? !name.trim() || name === props.section.name : undefined
            }
          />
        </form>
      )}
    </Modal>
  );
}
