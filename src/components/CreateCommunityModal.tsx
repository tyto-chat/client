import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateCommunity } from "@/queries/communityQueries";
import { uploadCommunityLogo } from "@/api/communities";
import { useNotification } from "@/context/NotificationContext";
import { useImageValidation } from "@/hooks/useImageValidation";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { getUserColor } from "@/utils/userColor";
import { queryKeys } from "@/queries/queryKeys";
import { UploadIcon } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { TextInput } from "@/components/TextInput";
import { ModalFooter } from "@/components/ModalFooter";
import { ErrorMessage } from "@/components/ErrorMessage";

export function CreateCommunityModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["community", "common"]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState("");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreviewFile] = useObjectUrl();
  const [logoError, setLogoError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const createCommunity = useCreateCommunity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useNotification();
  const { validateImage } = useImageValidation("logo");

  const isPending = createCommunity.isPending || uploadingLogo;

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const err = await validateImage(file);
    if (err) {
      setLogoError(err);
      return;
    }
    setLogoError("");
    setLogoFile(file);
    setLogoPreviewFile(file);
  }

  async function handleSubmit(e: React.FormEvent, close: () => void) {
    e.preventDefault();
    setError("");
    try {
      const community = await createCommunity.mutateAsync({
        name,
        description: description || undefined,
        isPrivate: isPrivate || undefined,
      });

      if (logoFile) {
        setUploadingLogo(true);
        try {
          await uploadCommunityLogo(community.identifier, logoFile);
        } catch {
          notify(t("logo_upload_failed_on_create"), "error");
        } finally {
          setUploadingLogo(false);
        }
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.communities() });
      close();
      navigate({ to: "/$communityId", params: { communityId: community.identifier } });
    } catch {
      setError(t("create_community_error"));
    }
  }

  return (
    <Modal title={t("create_community_title")} onClose={onClose}>
      {(close) => (
        <form onSubmit={(e) => handleSubmit(e, close)} className="space-y-4">
          <div className="flex flex-col items-center gap-1">
            <label
              className="group relative h-16 w-16 cursor-pointer overflow-hidden rounded-[13px]"
              title={t("set_logo")}
            >
              <div
                className="h-full w-full flex items-center justify-center text-xl font-bold text-white"
                style={{ backgroundColor: getUserColor(name || "new") }}
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="logo preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (name[0]?.toUpperCase() ?? "C")
                )}
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-[13px] bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <UploadIcon size={18} className="text-white" />
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isPending}
                onChange={handleLogoChange}
              />
            </label>
            <p className="text-xs text-fg-muted">{t("logo_optional")}</p>
            {logoError && <p className="text-xs text-red-500 dark:text-red-400">{logoError}</p>}
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
          <div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              {t("community_private_label")}
            </label>
            <p className="mt-1 pl-6 text-xs text-fg-muted">{t("community_private_hint")}</p>
          </div>
          <ErrorMessage message={error} />
          <ModalFooter
            onCancel={close}
            submitLabel={t("create_community")}
            isPending={isPending}
            pendingLabel={uploadingLogo ? t("uploading_logo") : t("common:creating")}
          />
        </form>
      )}
    </Modal>
  );
}
