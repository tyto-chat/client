import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { TextInput } from "@/components/TextInput";
import { Spinner, UploadIcon } from "@/components/icons";
import { useCommunity, useUpdateCommunity } from "@/queries/communityQueries";
import { removeCommunityLogo, uploadCommunityLogo } from "@/api/communities";
import { logoUrl } from "@/api/client";
import { useImageValidation } from "@/hooks/useImageValidation";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { useNotification } from "@/context/NotificationContext";
import { getUserColor } from "@/utils/userColor";
import { queryKeys } from "@/queries/queryKeys";
import { LanguageAutocomplete } from "@/components/LanguageAutocomplete";
import type { Community } from "@/types/api";

const DEFAULT_ACCENT = "#22d3ee";

function EditForm({ community, close }: { community: Community; close: () => void }) {
  const { t } = useTranslation(["admin", "community", "common"]);
  const { notify } = useNotification();
  const queryClient = useQueryClient();
  const updateCommunity = useUpdateCommunity(community.identifier);

  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? "");
  const [isPrivate, setIsPrivate] = useState(community.isPrivate ?? false);
  const [accentColor, setAccentColor] = useState(community.accentColor ?? DEFAULT_ACCENT);
  const [locale, setLocale] = useState(community.locale);

  const { validateImage } = useImageValidation("logo");
  const [logoPreview, setLogoPreviewFile] = useObjectUrl();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState("");
  const displayLogo = logoPreview ?? logoUrl(community.logo?.contentUrl ?? null, "md");

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = await validateImage(file);
    if (error) {
      setLogoError(error);
      return;
    }
    setLogoError("");
    setLogoPreviewFile(file);
    setUploadingLogo(true);
    try {
      await uploadCommunityLogo(community.identifier, file);
      void queryClient.invalidateQueries({ queryKey: queryKeys.community(community.identifier) });
      void queryClient.invalidateQueries({ queryKey: ["admin", "communities"], exact: false });
      notify(t("community:logo_updated"), "success");
    } catch {
      setLogoError(t("community:logo_upload_failed"));
      setLogoPreviewFile(null);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleLogoRemove() {
    setLogoError("");
    setUploadingLogo(true);
    try {
      await removeCommunityLogo(community.identifier);
      setLogoPreviewFile(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.community(community.identifier) });
      void queryClient.invalidateQueries({ queryKey: ["admin", "communities"], exact: false });
      notify(t("community:logo_removed"), "success");
    } catch {
      setLogoError(t("community:logo_remove_failed"));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateCommunity.mutateAsync({
        name: name !== community.name ? name : undefined,
        description: description !== (community.description ?? "") ? description : undefined,
        isPrivate: isPrivate !== (community.isPrivate ?? false) ? isPrivate : undefined,
        accentColor:
          accentColor !== (community.accentColor ?? DEFAULT_ACCENT) ? accentColor : undefined,
        locale: locale !== community.locale ? locale : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "communities"], exact: false });
      notify(t("community:community_updated"), "success");
      close();
    } catch {
      notify(t("community:community_update_failed"), "error");
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="flex flex-col items-center gap-1">
        <label
          className="group relative h-16 w-16 cursor-pointer overflow-hidden rounded-[13px]"
          title={t("community:change_logo")}
        >
          <div
            className="flex h-full w-full items-center justify-center text-xl font-bold text-white"
            style={{ backgroundColor: displayLogo ? undefined : getUserColor(community["@id"]) }}
          >
            {displayLogo ? (
              <img src={displayLogo} alt="logo" className="h-full w-full object-cover" />
            ) : (
              (community.name[0]?.toUpperCase() ?? "C")
            )}
          </div>
          <div className="absolute inset-0 flex items-center justify-center rounded-[13px] bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {uploadingLogo ? (
              <Spinner size={18} className="text-white" />
            ) : (
              <UploadIcon size={18} className="text-white" />
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            aria-label={t("community:change_logo")}
            className="hidden"
            disabled={uploadingLogo}
            onChange={(e) => void handleLogoChange(e)}
          />
        </label>
        {displayLogo && (
          <button
            type="button"
            onClick={() => void handleLogoRemove()}
            disabled={uploadingLogo}
            className="text-xs text-red-500 hover:underline disabled:opacity-40 dark:text-red-400"
          >
            {t("community:remove_logo")}
          </button>
        )}
        {logoError && <p className="text-xs text-red-500 dark:text-red-400">{logoError}</p>}
      </div>
      <TextInput
        label={t("common:name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <div>
        <label className="mb-1 block text-sm text-fg-muted">
          {t("common:description")} <span className="text-fg-subtle">{t("common:optional")}</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          aria-label={t("common:description")}
          className="w-full rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-fg-muted">{t("community:accent_color")}</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            aria-label={t("community:accent_color")}
            className="h-8 w-12 cursor-pointer rounded border border-line bg-canvas"
          />
          <span className="font-mono text-sm text-fg-muted">{accentColor}</span>
        </div>
      </div>
      <div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          {t("community:community_private_label")}
        </label>
      </div>
      <div>
        <label className="mb-1 block text-sm text-fg-muted">
          {t("community:community_locale")}
        </label>
        <LanguageAutocomplete value={locale} onChange={setLocale} testId="admin-community-locale" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="text-sm text-fg-muted hover:text-fg">
          {t("admin:cancel")}
        </button>
        <button
          type="submit"
          disabled={updateCommunity.isPending || !name.trim()}
          className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
        >
          {updateCommunity.isPending ? t("admin:saving") : t("admin:save")}
        </button>
      </div>
    </form>
  );
}

export function AdminEditCommunityModal({
  identifier,
  onClose,
}: {
  identifier: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("admin");
  const { data: community } = useCommunity(identifier);

  return (
    <Modal title={t("community_edit_title")} onClose={onClose}>
      {(close) =>
        !community ? (
          <div className="flex justify-center py-8 text-fg-muted">
            <Spinner />
          </div>
        ) : (
          <EditForm community={community} close={close} />
        )
      }
    </Modal>
  );
}
