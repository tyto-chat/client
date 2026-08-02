import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "@/hooks/useAuth";
import { completeUserOnboarding, updateProfile, uploadAvatar } from "@/api/users";
import { fetchCommunities } from "@/api/communities";
import { useJoinCommunity } from "@/queries/communityQueries";
import { fetchMyCommunityMemberships } from "@/api/membership";
import { Avatar } from "@/components/Avatar";
import { apiErrorText, avatarUrl as getAvatarUrl } from "@/api/client";
import { communityMemberIdSet, isCommunityMember } from "@/utils/membership";
import type { Community, User } from "@/types/api";
import { WizardPrimaryButton, WizardRail } from "./wizardUi";

type Step = 1 | 2;

export function WelcomeWizard({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return <WelcomeWizardInner user={user} onClose={onClose} />;
}

function WelcomeWizardInner({ user, onClose }: { user: User; onClose: () => void }) {
  const { t, i18n } = useTranslation(["auth", "settings"]);
  const { refreshUser } = useAuth();
  const joinCommunityMutation = useJoinCommunity();

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(user.profile.name);
  const [bio, setBio] = useState(user.profile.bio ?? "");
  const [location, setLocation] = useState(user.profile.location ?? "");
  const [website, setWebsite] = useState(user.profile.website ?? "");
  const [month, setMonth] = useState<number | "">(user.profile.birthdayMonth ?? "");
  const [day, setDay] = useState<number | "">(user.profile.birthdayDay ?? "");
  const [avatar, setAvatar] = useState<{ file: File; preview: string } | null>(null);

  const [communities, setCommunities] = useState<Community[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  function pickAvatar(file: File | null) {
    setAvatar(file ? { file, preview: URL.createObjectURL(file) } : null);
  }

  useEffect(() => {
    const url = avatar?.preview;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [avatar]);

  useEffect(() => {
    void (async () => {
      const [all, myMemberships] = await Promise.all([
        fetchCommunities(),
        fetchMyCommunityMemberships(),
      ]);
      setCommunities(all.filter((c) => !c.isPrivate).slice(0, 8));
      const memberIds = communityMemberIdSet(myMemberships);
      const isGlobalAdmin = user.roles?.includes("ROLE_ADMIN") ?? false;
      setJoinedIds(
        new Set(
          all
            .filter((c) => isCommunityMember(c.id, memberIds, isGlobalAdmin))
            .map((c) => c.identifier),
        ),
      );
    })();
  }, [user]);

  async function saveProfile() {
    setBusy(true);
    setError(null);
    try {
      const desiredName = displayName.trim();
      const hasBirthday = month !== "" && day !== "";
      await updateProfile(user.profile["@id"], {
        ...(desiredName.length > 0 && desiredName !== user.profile.name
          ? { name: desiredName }
          : {}),
        bio: bio.trim() || null,
        location: location.trim() || null,
        website: website.trim() || null,
        birthdayMonth: hasBirthday ? Number(month) : null,
        birthdayDay: hasBirthday ? Number(day) : null,
      });
      if (avatar) {
        await uploadAvatar(avatar.file);
      }
      await refreshUser();
      setStep(2);
    } catch (e) {
      setError(apiErrorText(e, t("welcome_save_failed")));
    } finally {
      setBusy(false);
    }
  }

  async function joinOne(c: Community) {
    setBusy(true);
    try {
      await joinCommunityMutation.mutateAsync(c.identifier);
      setJoinedIds((prev) => new Set(prev).add(c.identifier));
    } catch (e) {
      setError(apiErrorText(e, t("welcome_join_failed")));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await completeUserOnboarding();
      await refreshUser();
      onClose();
    } catch (e) {
      setError(apiErrorText(e, t("welcome_save_failed")));
    } finally {
      setBusy(false);
    }
  }

  const heads: Record<Step, { title: string; sub: string }> = {
    1: { title: t("welcome_title"), sub: t("welcome_subtitle") },
    2: { title: t("welcome_communities_title"), sub: t("welcome_communities_intro") },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10"
      onMouseDown={() => void finish()}
    >
      <div
        className="grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl bg-canvas ring-1 ring-inset ring-line shadow-soft-lg sm:grid-cols-[216px_1fr]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <WizardRail
          eyebrow={t("welcome_eyebrow")}
          note={t("welcome_rail_note")}
          steps={[t("welcome_step_profile"), t("welcome_step_communities")]}
          current={step}
        />

        <div className="flex min-w-0 flex-col">
          <header className="flex items-start justify-between gap-3 px-6 pt-5">
            <div>
              <h1 className="text-xl font-bold text-fg">{heads[step].title}</h1>
              <p className="mt-1 max-w-md text-sm text-fg-muted">{heads[step].sub}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish()}
              className="whitespace-nowrap text-xs font-medium text-fg-subtle hover:text-fg hover:underline disabled:opacity-40"
            >
              {t("welcome_skip")}
            </button>
          </header>

          <div className="flex flex-col gap-4 px-6 py-5">
            {step === 1 && (
              <ProfileStep
                t={t}
                locale={i18n.language}
                displayName={displayName}
                setDisplayName={setDisplayName}
                bio={bio}
                setBio={setBio}
                location={location}
                setLocation={setLocation}
                website={website}
                setWebsite={setWebsite}
                month={month}
                setMonth={setMonth}
                day={day}
                setDay={setDay}
                avatarFile={avatar?.file ?? null}
                setAvatarFile={pickAvatar}
                avatarPreview={avatar?.preview ?? null}
                currentAvatarUrl={getAvatarUrl(user.profile.avatar?.contentUrl ?? null)}
              />
            )}
            {step === 2 && (
              <CommunitiesStep
                t={t}
                communities={communities}
                joinedIds={joinedIds}
                busy={busy}
                onJoin={(c) => void joinOne(c)}
              />
            )}

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          <footer className="mt-auto flex items-center justify-between border-t border-line px-6 py-3.5">
            <button
              type="button"
              disabled={step === 1 || busy}
              onClick={() => setStep(1)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface disabled:opacity-30"
            >
              {t("welcome_back")}
            </button>
            <div className="flex items-center gap-2">
              {step === 1 && (
                <WizardPrimaryButton
                  disabled={busy || displayName.trim().length < 2}
                  onClick={() => void saveProfile()}
                  label={t("welcome_next")}
                />
              )}
              {step === 2 && (
                <WizardPrimaryButton
                  disabled={busy}
                  onClick={() => void finish()}
                  label={t("welcome_finish")}
                />
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

type T = TFunction<readonly ["auth", "settings"]>;

function ProfileStep({
  t,
  locale,
  displayName,
  setDisplayName,
  bio,
  setBio,
  location,
  setLocation,
  website,
  setWebsite,
  month,
  setMonth,
  day,
  setDay,
  avatarFile,
  setAvatarFile,
  avatarPreview,
  currentAvatarUrl,
}: {
  t: T;
  locale: string;
  displayName: string;
  setDisplayName: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
  month: number | "";
  setMonth: (v: number | "") => void;
  day: number | "";
  setDay: (v: number | "") => void;
  avatarFile: File | null;
  setAvatarFile: (f: File | null) => void;
  avatarPreview: string | null;
  currentAvatarUrl: string | null;
}) {
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString(locale, { month: "long" }),
  );
  const fieldClass =
    "w-full rounded-lg bg-surface px-3 py-2 text-sm text-fg ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-[var(--accent)]";
  const selectClass =
    "rounded-lg bg-surface px-3 py-2 text-sm text-fg ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-[var(--accent)]";
  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-fg">{t("display_name")}</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={fieldClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-fg">
          {t("settings:profile_bio")}
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={190}
          rows={2}
          className={`${fieldClass} resize-none`}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-fg">
            {t("settings:profile_location")}
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={100}
            className={fieldClass}
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-fg">
            {t("settings:profile_website")}
          </label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-fg">
          {t("settings:profile_birthday")}
        </label>
        <div className="flex gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value === "" ? "" : Number(e.target.value))}
            className={`${selectClass} min-w-36 flex-1`}
          >
            <option value="">{t("settings:profile_birthday_month")}</option>
            {monthNames.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={day}
            onChange={(e) => setDay(e.target.value === "" ? "" : Number(e.target.value))}
            className={`${selectClass} w-24`}
          >
            <option value="">{t("settings:profile_birthday_day")}</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-fg">{t("welcome_avatar")}</label>
        <div className="flex items-center gap-3">
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt=""
              className="h-16 w-16 rounded-full object-cover ring-2 ring-line"
            />
          ) : (
            <Avatar
              name={displayName || "?"}
              colorKey={displayName || "?"}
              imageUrl={currentAvatarUrl}
              size="lg"
            />
          )}
          <label className="cursor-pointer rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-fg ring-1 ring-inset ring-line transition-colors hover:bg-raised">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />
            {avatarFile ? t("welcome_avatar_change") : t("welcome_avatar_pick")}
          </label>
          {avatarFile && (
            <button
              type="button"
              onClick={() => setAvatarFile(null)}
              className="rounded-lg border border-line px-2 py-1 text-xs text-fg hover:bg-surface"
            >
              {t("welcome_avatar_clear")}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-fg-muted">{t("welcome_avatar_hint")}</p>
      </div>
    </div>
  );
}

function CommunitiesStep({
  t,
  communities,
  joinedIds,
  busy,
  onJoin,
}: {
  t: T;
  communities: Community[];
  joinedIds: Set<string>;
  busy: boolean;
  onJoin: (c: Community) => void;
}) {
  return (
    <div className="space-y-3">
      {communities.length === 0 ? (
        <p className="rounded-md bg-surface px-3 py-4 text-center text-xs text-fg-muted">
          {t("welcome_communities_empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {communities.map((c) => {
            const joined = joinedIds.has(c.identifier);
            return (
              <li
                key={c.identifier}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{c.name}</p>
                  {c.description && (
                    <p className="truncate text-xs text-fg-muted">{c.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy || joined}
                  onClick={() => onJoin(c)}
                  className={`shrink-0 rounded-lg px-3 py-1 text-xs font-semibold ${
                    joined
                      ? "bg-success-subtle text-success"
                      : "bg-[var(--accent-strong)] text-on-accent shadow-soft-sm transition hover:opacity-90"
                  } disabled:opacity-50`}
                >
                  {joined ? t("welcome_joined") : t("welcome_join")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-fg-muted">{t("welcome_communities_skip_hint")}</p>
    </div>
  );
}
