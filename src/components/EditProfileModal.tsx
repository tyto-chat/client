import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { updateProfile, uploadAvatar } from "@/api/users";
import { useNotification } from "@/context/NotificationContext";
import { useImageValidation } from "@/hooks/useImageValidation";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { getUserColor } from "@/utils/userColor";
import { UploadIcon, Spinner } from "@/components/icons";
import { Modal } from "@/components/Modal";

interface Props {
  name: string;
  profileIri: string;
  currentAvatarUrl?: string;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function EditProfileModal({
  name: initialName,
  profileIri,
  currentAvatarUrl,
  bio: initialBio,
  location: initialLocation,
  website: initialWebsite,
  birthdayMonth: initialMonth,
  birthdayDay: initialDay,
  onClose,
  onSaved,
}: Props) {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const { notify } = useNotification();
  const queryClient = useQueryClient();
  const { validateImage } = useImageValidation();

  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio ?? "");
  const [location, setLocation] = useState(initialLocation ?? "");
  const [website, setWebsite] = useState(initialWebsite ?? "");
  const [month, setMonth] = useState<number | "">(initialMonth ?? "");
  const [day, setDay] = useState<number | "">(initialDay ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");

  const dirty =
    name !== initialName ||
    bio !== (initialBio ?? "") ||
    location !== (initialLocation ?? "") ||
    website !== (initialWebsite ?? "") ||
    month !== (initialMonth ?? "") ||
    day !== (initialDay ?? "");

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString(i18n.language, { month: "long" }),
  );

  const [preview, setPreviewFile] = useObjectUrl();
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [removingAvatar, setRemovingAvatar] = useState(false);

  function invalidateAuthorCaches() {
    for (const key of [
      ["channelPages"],
      ["channelLatestPage"],
      ["threadReplies"],
      ["pinnedMessages"],
      ["message"],
      ["conversations"],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  async function handleSaveDetails(e: React.FormEvent, close: () => void) {
    e.preventDefault();
    setSavingName(true);
    setNameError("");
    const hasBirthday = month !== "" && day !== "";
    try {
      await updateProfile(profileIri, {
        name,
        bio: bio.trim() || null,
        location: location.trim() || null,
        website: website.trim() || null,
        birthdayMonth: hasBirthday ? Number(month) : null,
        birthdayDay: hasBirthday ? Number(day) : null,
      });
      await onSaved();
      invalidateAuthorCaches();
      notify(t("profile_updated"), "success");
      close();
    } catch {
      setNameError(t("profile_update_failed"));
    } finally {
      setSavingName(false);
    }
  }

  async function handleRemoveAvatar() {
    setRemovingAvatar(true);
    setAvatarError("");
    try {
      await updateProfile(profileIri, { avatar: null });
      await onSaved();
      invalidateAuthorCaches();
      setPreviewFile(null);
      notify(t("avatar_removed"), "success");
    } catch {
      setAvatarError(t("avatar_remove_failed"));
    } finally {
      setRemovingAvatar(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setSavingAvatar(true);
    setAvatarError("");
    const err = await validateImage(file);
    if (err) {
      setSavingAvatar(false);
      setAvatarError(err);
      return;
    }
    setPreviewFile(file);
    try {
      await uploadAvatar(file);
      await onSaved();
      invalidateAuthorCaches();
      notify(t("avatar_updated"), "success");
    } catch {
      setAvatarError(t("avatar_upload_failed"));
      setPreviewFile(null);
    } finally {
      setSavingAvatar(false);
    }
  }

  return (
    <Modal title={t("edit_profile_title")} onClose={onClose}>
      {(close) => (
        <div className="space-y-5">
          <div>
            <div className="flex flex-col items-center gap-2">
              <label
                className="group relative h-20 w-20 cursor-pointer overflow-hidden rounded-full"
                title={t("change_avatar")}
              >
                <div
                  className="h-full w-full flex items-center justify-center text-2xl font-bold text-white"
                  style={{ backgroundColor: getUserColor(profileIri) }}
                >
                  {(preview ?? currentAvatarUrl) ? (
                    <img
                      src={preview ?? currentAvatarUrl}
                      alt="avatar"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (name[0]?.toUpperCase() ?? "?")
                  )}
                </div>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {savingAvatar ? (
                    <Spinner size={20} className="text-white" />
                  ) : (
                    <UploadIcon size={20} className="text-white" />
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={savingAvatar}
                  onChange={handleAvatarChange}
                />
              </label>
              {(preview ?? currentAvatarUrl) && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={savingAvatar || removingAvatar}
                  className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40"
                >
                  {removingAvatar ? t("removing_avatar") : t("remove_avatar")}
                </button>
              )}
              {avatarError && (
                <p className="text-xs text-red-500 dark:text-red-400">{avatarError}</p>
              )}
            </div>
          </div>
          <form onSubmit={(e) => handleSaveDetails(e, close)} className="space-y-3">
            <div>
              <p className="mb-1 text-sm text-fg-muted">{t("display_name")}</p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
              />
            </div>

            <div>
              <p className="mb-1 text-sm text-fg-muted">{t("profile_bio")}</p>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={190}
                rows={2}
                className="w-full resize-none rounded-lg bg-surface px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <p className="mb-1 text-sm text-fg-muted">{t("profile_location")}</p>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={100}
                  className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
                />
              </div>
              <div className="flex-1">
                <p className="mb-1 text-sm text-fg-muted">{t("profile_website")}</p>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://"
                  className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
                />
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm text-fg-muted">{t("profile_birthday")}</p>
              <div className="flex gap-2">
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value === "" ? "" : Number(e.target.value))}
                  className="min-w-36 flex-1 rounded-lg bg-surface px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
                >
                  <option value="">{t("profile_birthday_month")}</option>
                  {monthNames.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-24 rounded-lg bg-surface px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
                >
                  <option value="">{t("profile_birthday_day")}</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingName || !dirty}
                className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
              >
                {savingName ? t("common:saving") : t("common:save")}
              </button>
            </div>
            {nameError && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400">{nameError}</p>
            )}
          </form>
        </div>
      )}
    </Modal>
  );
}
