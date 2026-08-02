import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useNotification } from "@/context/NotificationContext";
import { useClickOutside } from "@/hooks/useClickOutside";
import { avatarUrl as getAvatarUrl } from "@/api/client";
import { getUserTextColor } from "@/utils/userColor";
import { Avatar } from "@/components/Avatar";
import { PresenceDot } from "@/components/PresenceDot";
import {
  useUserPresence,
  usePresenceSubscription,
  useSetManualPresence,
} from "@/queries/presenceQueries";
import type { ManualPresenceStatus, PresenceState } from "@/types/api";
import { LogInIcon, MoonIcon, SunIcon } from "@/components/icons";
import { useTheme } from "@/context/ThemeContext";
import { CommunityManagerModal } from "@/components/CommunityManagerModal";
import { MyGroupsModal } from "@/components/MyGroupsModal";
import { EditProfileModal } from "@/components/EditProfileModal";
import { PreferencesModal } from "@/components/PreferencesModal";
import { AdminPanelModal } from "@/components/AdminPanelModal";
import { useAuthModal } from "@/context/AuthModalContext";
import { useMarkEverythingRead } from "@/queries/readStateQueries";
import { useSetupStatus } from "@/queries/adminSetupQueries";
import { MenuItem } from "@/components/MenuItem";

export function UserProfileButton() {
  const { t } = useTranslation(["settings", "auth", "common"]);
  const { t: tCommon } = useTranslation(["common", "auth"]);
  const { user, token, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { openLogin } = useAuthModal();
  const { theme, toggle: toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const isAdmin = user?.roles?.includes("ROLE_ADMIN") ?? false;
  const { data: setup } = useSetupStatus(isAdmin);
  const needsAttention = setup?.needsAttention ?? false;
  const [modal, setModal] = useState<
    "profile" | "preferences" | "admin" | "communities" | "groups" | null
  >(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const ownPresenceIds = useMemo(() => (user ? [user.id] : []), [user]);
  usePresenceSubscription(ownPresenceIds);
  const myPresence = useUserPresence(user?.id);
  const setManual = useSetManualPresence();
  const markEverythingRead = useMarkEverythingRead();

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setConfirmingLogout(false);
  }, []);

  const closeAndRefocus = useCallback(() => {
    closeMenu();
    triggerRef.current?.focus();
  }, [closeMenu]);

  useClickOutside(ref, closeMenu, menuOpen, { onEscape: closeAndRefocus });

  const name = user?.profile.name ?? user?.email ?? "?";
  const currentAvatarUrl = getAvatarUrl(user?.profile.avatar?.contentUrl ?? null, "md");
  const currentAvatarUrlLg = getAvatarUrl(user?.profile.avatar?.contentUrl ?? null, "lg");

  if (!token) {
    return (
      <div className="flex w-full flex-col items-center gap-2 pb-2">
        <button
          onClick={toggleTheme}
          title={t(theme === "dark" ? "theme_light" : "theme_dark")}
          data-testid="guest-theme-toggle"
          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-raised hover:text-fg"
        >
          {theme === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
        </button>
        <button
          onClick={openLogin}
          title={t("auth:sign_in")}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[var(--accent-on)] shadow-md transition hover:opacity-90"
        >
          <LogInIcon size={18} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative flex w-full justify-center pb-2">
      <button
        ref={triggerRef}
        onClick={() => setMenuOpen((v) => !v)}
        title={name}
        data-testid="profile-menu-button"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        className="relative flex rounded-full hover:ring-2 hover:ring-[var(--accent)]"
      >
        <Avatar
          name={name}
          colorKey={user?.profile["@id"] ?? ""}
          imageUrl={currentAvatarUrl}
          size="md"
          userId={user?.id}
        />
        {needsAttention && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-rail"
            title={t("setup_needs_attention")}
          />
        )}
      </button>

      {menuOpen && (
        <div
          data-testid="profile-menu"
          className="animate-menu-in absolute bottom-0 left-full ml-2 w-52 rounded-lg border border-line bg-overlay py-1 shadow-soft-lg z-50"
        >
          <div className="border-b border-line px-3 py-2">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: getUserTextColor(user?.profile["@id"] ?? "") }}
            >
              {name}
              {user?.roles?.includes("ROLE_ADMIN") && (
                <span className="ml-1 text-yellow-500" title={t("admin_role")}>
                  ★
                </span>
              )}
            </p>
            <p className="truncate text-xs text-fg-muted">{user?.email}</p>
          </div>
          <StatusSection
            current={myPresence}
            disabled={setManual.isPending}
            onSelect={(status) => setManual.mutate(status)}
            t={tCommon}
          />
          <div className="border-b border-line" />
          <MenuItem
            onClick={() => {
              setModal("profile");
              closeMenu();
            }}
          >
            {t("edit_profile_menu")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setModal("communities");
              closeMenu();
            }}
          >
            {t("manage_communities_menu")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setModal("groups");
              closeMenu();
            }}
          >
            {t("my_groups_menu")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              markEverythingRead.mutate(undefined, {
                onSuccess: () => notify(t("mark_all_read_done"), "success"),
              });
              closeMenu();
            }}
            disabled={markEverythingRead.isPending}
          >
            {t("mark_everything_read_menu")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setModal("preferences");
              closeMenu();
            }}
          >
            {t("preferences_menu")}
          </MenuItem>
          {isAdmin && (
            <button
              onClick={() => {
                void navigate({ to: "/admin" });
                closeMenu();
              }}
              data-testid="admin-panel-menu-entry"
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-fg hover:bg-surface"
            >
              {t("admin_panel_menu")}
              {needsAttention && (
                <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
              )}
            </button>
          )}
          <div className="mt-1 border-t border-line">
            {confirmingLogout ? (
              <div className="animate-message-in px-3 py-2">
                <p className="mb-2 text-sm text-fg">{t("auth:sign_out_confirm")}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      notify(t("auth:signed_out"), "info");
                      void logout().then(() => {
                        void navigate({ to: "/" });
                        openLogin();
                      });
                    }}
                    className="flex-1 rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                  >
                    {t("auth:sign_out")}
                  </button>
                  <button
                    onClick={() => setConfirmingLogout(false)}
                    className="flex-1 rounded-lg bg-surface px-3 py-1.5 text-sm font-semibold text-fg hover:bg-raised"
                  >
                    {t("common:cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingLogout(true)}
                className="w-full px-3 py-2 text-left text-sm text-danger hover:bg-surface"
              >
                {t("auth:sign_out")}
              </button>
            )}
          </div>
        </div>
      )}

      {modal === "profile" && (
        <EditProfileModal
          name={user?.profile.name ?? ""}
          profileIri={user?.profile["@id"] ?? ""}
          currentAvatarUrl={currentAvatarUrlLg ?? undefined}
          bio={user?.profile.bio ?? null}
          location={user?.profile.location ?? null}
          website={user?.profile.website ?? null}
          birthdayMonth={user?.profile.birthdayMonth ?? null}
          birthdayDay={user?.profile.birthdayDay ?? null}
          onClose={() => setModal(null)}
          onSaved={refreshUser}
        />
      )}
      {modal === "preferences" && <PreferencesModal onClose={() => setModal(null)} />}
      {modal === "communities" && <CommunityManagerModal onClose={() => setModal(null)} />}
      {modal === "groups" && <MyGroupsModal onClose={() => setModal(null)} />}
      {modal === "admin" && <AdminPanelModal onClose={() => setModal(null)} />}
    </div>
  );
}

interface StatusChoice {
  key: "online" | ManualPresenceStatus;
  state: PresenceState;
}

const ONLINE_CHOICE: StatusChoice = { key: "online", state: "online" };

const STATUS_CHOICES: StatusChoice[] = [
  ONLINE_CHOICE,
  { key: "away", state: "away" },
  { key: "dnd", state: "dnd" },
  { key: "invisible", state: "offline" },
];

interface StatusSectionProps {
  current: PresenceState;
  disabled: boolean;
  onSelect: (status: ManualPresenceStatus | null) => void;
  t: TFunction<readonly ["common", "auth"]>;
}

function StatusSection({ current, disabled, onSelect, t }: StatusSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const currentChoice = STATUS_CHOICES.find((c) => c.state === current) ?? ONLINE_CHOICE;

  return (
    <div className="border-t border-line px-1 py-1">
      {!expanded ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setExpanded(true)}
          data-testid="status-current"
          data-state={currentChoice.state}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface disabled:opacity-50"
        >
          <PresenceDot state={currentChoice.state} size="sm" hideOffline={false} />
          <span className="flex-1 truncate">{t(`presence.${currentChoice.key}`)}</span>
          <span className="text-xs text-fg-subtle">▸</span>
        </button>
      ) : (
        STATUS_CHOICES.map(({ key, state }) => {
          const active = current === state;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              data-testid={`status-option-${key}`}
              onClick={() => {
                onSelect(key === "online" ? null : key);
                setExpanded(false);
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                active ? "bg-surface" : "hover:bg-surface"
              } disabled:opacity-50`}
            >
              <PresenceDot state={state} size="sm" hideOffline={false} />
              <span className="truncate">{t(`presence.${key}`)}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
