import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateCommunity } from "@/queries/communityQueries";
import { uploadCommunityLogo } from "@/api/communities";
import { useNotification } from "@/context/NotificationContext";
import { useImageValidation } from "@/hooks/useImageValidation";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { logoUrl } from "@/api/client";
import { getUserColor } from "@/utils/userColor";
import { queryKeys } from "@/queries/queryKeys";
import { UploadIcon, Spinner } from "@/components/icons";
import { TextInput } from "@/components/TextInput";
import { ModalFooter } from "@/components/ModalFooter";
import { ErrorMessage } from "@/components/ErrorMessage";
import { LanguageAutocomplete } from "@/components/LanguageAutocomplete";
import type { Community } from "@/types/api";

export function EditCommunityPanel({
  community,
  onClose,
}: {
  community: Community;
  onClose: () => void;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const updateCommunity = useUpdateCommunity(community.identifier);
  const { validateImage } = useImageValidation("logo");

  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? "");
  const [accentColor, setAccentColor] = useState(community.accentColor ?? "#22d3ee");
  const [broadcastRole, setBroadcastRole] = useState(community.broadcastMentionMinRole);
  const [isPrivate, setIsPrivate] = useState(community.isPrivate ?? false);
  const [locale, setLocale] = useState(community.locale);
  const [welcomeChannelIdentifier, setWelcomeChannelIdentifier] = useState<string>(
    community.welcomeChannel?.identifier ?? "",
  );
  const [nameError, setNameError] = useState("");
  const [logoPreview, setLogoPreviewFile] = useObjectUrl();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState("");

  const currentLogoUrl = logoUrl(community.logo?.contentUrl ?? null, "md");

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.community(community.identifier) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.communities() });
      notify(t("logo_updated"), "success");
    } catch {
      setLogoError(t("logo_upload_failed"));
      setLogoPreviewFile(null);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setNameError("");
    const currentWelcome = community.welcomeChannel?.identifier ?? "";
    const welcomeChanged = welcomeChannelIdentifier !== currentWelcome;
    try {
      const updated = await updateCommunity.mutateAsync({
        name: name !== community.name ? name : undefined,
        description: description !== community.description ? description : undefined,
        accentColor: accentColor !== (community.accentColor ?? "#22d3ee") ? accentColor : undefined,
        broadcastMentionMinRole:
          broadcastRole !== community.broadcastMentionMinRole ? broadcastRole : undefined,
        isPrivate: isPrivate !== (community.isPrivate ?? false) ? isPrivate : undefined,
        locale: locale !== community.locale ? locale : undefined,
        welcomeChannelIdentifier: welcomeChanged
          ? welcomeChannelIdentifier === ""
            ? null
            : welcomeChannelIdentifier
          : undefined,
      });
      notify(t("community_updated"), "success");
      if (updated.identifier !== community.identifier) {
        await navigate({ to: "/$communityId", params: { communityId: updated.identifier } });
      }
      onClose();
    } catch {
      setNameError(t("community_update_failed"));
    }
  }

  const displayLogo = logoPreview ?? currentLogoUrl;
  const currentWelcomeIdentifier = community.welcomeChannel?.identifier ?? "";
  const isSaveDisabled =
    updateCommunity.isPending ||
    (name === community.name &&
      description === (community.description ?? "") &&
      accentColor === (community.accentColor ?? "#22d3ee") &&
      broadcastRole === community.broadcastMentionMinRole &&
      isPrivate === (community.isPrivate ?? false) &&
      locale === community.locale &&
      welcomeChannelIdentifier === currentWelcomeIdentifier);

  const welcomeChannelOptions = community.channels.filter((c) => c.type === "text" && !c.isPrivate);

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-1">
        <label
          className="group relative h-16 w-16 cursor-pointer overflow-hidden rounded-[13px]"
          title={t("change_logo")}
        >
          <div
            className="h-full w-full flex items-center justify-center text-xl font-bold text-white"
            style={{
              backgroundColor: displayLogo ? undefined : getUserColor(community["@id"]),
            }}
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
            className="hidden"
            disabled={uploadingLogo}
            onChange={handleLogoChange}
          />
        </label>
        <p className="text-xs text-fg-muted">{t("logo_optional")}</p>
        {logoError && <p className="text-xs text-red-500 dark:text-red-400">{logoError}</p>}
      </div>
      <form onSubmit={handleSave} className="space-y-4">
        <TextInput
          label={t("common:name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
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
          <label className="mb-1 block text-sm text-fg-muted">
            {t("accent_color")} <span className="text-fg-subtle">{t("common:optional")}</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value.toLowerCase())}
              className="h-9 w-14 cursor-pointer rounded-lg bg-canvas ring-1 ring-inset ring-line p-0.5"
            />
            <span className="font-mono text-sm text-fg-muted">{accentColor}</span>
            {community.accentColor && (
              <button
                type="button"
                onClick={() => setAccentColor("#22d3ee")}
                className="text-xs text-fg-subtle hover:text-fg"
              >
                {t("reset_to_default")}
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-fg-muted">{t("broadcast_min_role")}</label>
          <select
            value={broadcastRole}
            onChange={(e) => setBroadcastRole(e.target.value as "member" | "moderator" | "admin")}
            className="w-full rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-sm"
          >
            <option value="member">{t("broadcast_role_member")}</option>
            <option value="moderator">{t("broadcast_role_moderator")}</option>
            <option value="admin">{t("broadcast_role_admin")}</option>
          </select>
          <p className="mt-1 text-xs text-fg-muted">{t("broadcast_min_role_hint")}</p>
        </div>
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
        <div>
          <label className="mb-1 block text-sm text-fg-muted">{t("community_locale")}</label>
          <LanguageAutocomplete value={locale} onChange={setLocale} testId="community-locale" />
          <p className="mt-1 text-xs text-fg-muted">{t("community_locale_hint")}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-fg-muted">{t("welcome_channel_label")}</label>
          <select
            value={welcomeChannelIdentifier}
            onChange={(e) => setWelcomeChannelIdentifier(e.target.value)}
            className="w-full rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-sm"
          >
            <option value="">{t("welcome_channel_none")}</option>
            {welcomeChannelOptions.map((c) => (
              <option key={c["@id"]} value={c.identifier}>
                #{c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-fg-muted">{t("welcome_channel_hint")}</p>
        </div>
        <ErrorMessage message={nameError} />
        <ModalFooter
          onCancel={onClose}
          submitLabel={t("common:save")}
          pendingLabel={t("common:saving")}
          isPending={updateCommunity.isPending}
          disabled={isSaveDisabled}
        />
      </form>
    </div>
  );
}
