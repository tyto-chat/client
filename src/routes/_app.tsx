import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { UserProfileButton } from "@/components/UserProfileButton";
import { AccountPendingDeletionGate } from "@/components/AccountPendingDeletionGate";
import { useAccountDeletionStatus } from "@/queries/accountDeletionQueries";
import { CommunityRail } from "@/components/CommunityRail";
import { DesktopRailGroups } from "@/desktop/DesktopRail";
import { isManagedIdentityMode } from "@/platform/appMode";
import {
  getActiveIdentityKey,
  requestIdentitySwitch,
  subscribeActiveIdentity,
} from "@/platform/activeIdentity";
import { ConnectionNotificationBridge } from "@/desktop/ConnectionNotificationBridge";
import { useAuth } from "@/hooks/useAuth";
import { useServerInfo } from "@/hooks/useServerInfo";
import { SetupWizard } from "@/components/onboarding/SetupWizard";
import { WelcomeWizard } from "@/components/onboarding/WelcomeWizard";
import { queryKeys } from "@/queries/queryKeys";
import { StaleTime } from "@/queries/staleTimes";
import { fetchUnreadCounts } from "@/api/notifications";
import { fetchMyCommunityMemberships } from "@/api/membership";
import { useUserNotificationsMercure } from "@/hooks/useUserNotificationsMercure";
import { useUserEventsMercure } from "@/hooks/useUserEventsMercure";
import { useConversationActivityMercure } from "@/hooks/useMercure";
import { usePresenceOfflineOnUnload } from "@/hooks/usePresenceOfflineOnUnload";
import { useWebPush } from "@/hooks/useWebPush";
import { ChatBubbleIcon } from "@/components/icons";
import { AudioCallProvider, useAudioCall } from "@/context/AudioCallContext";
import { PersistentAudioRoom } from "@/components/PersistentAudioRoom";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  MicrophoneIcon,
  MicOffIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "@/components/icons";
import { AuthModalProvider } from "@/context/AuthModalContext";
import { LoginModal } from "@/components/LoginModal";
import { RegisterModal } from "@/components/RegisterModal";
import { SetupAttentionBanner } from "@/components/SetupAttentionBanner";
import { MenuItem } from "@/components/MenuItem";
import { MobileNavProvider, useMobileNav } from "@/context/MobileNavContext";
import { MessagePopoverProvider } from "@/context/MessagePopoverContext";
import { cn } from "@/utils/cn";

export const Route = createFileRoute("/_app")({
  loader: ({ context: { queryClient, auth } }) => {
    if (!auth.token) return;
    void queryClient.prefetchQuery({
      queryKey: queryKeys.myMemberships(),
      queryFn: fetchMyCommunityMemberships,
      staleTime: StaleTime.long,
    });
  },
  component: AppShell,
});

function CommunityVoiceIndicator({ communityIdentifier }: { communityIdentifier: string }) {
  const { activeCall } = useAudioCall();
  if (activeCall?.communityId !== communityIdentifier) return null;
  return (
    <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-rail" />
  );
}

export function ActiveVoiceButton() {
  const { t } = useTranslation("channel");
  const {
    activeCall,
    leave,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    isCameraEnabled,
    setCameraEnabled,
  } = useAudioCall();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useClickOutside(ref, closeMenu, menuOpen);
  const activeIdentityKey = useSyncExternalStore(subscribeActiveIdentity, getActiveIdentityKey);

  if (!activeCall) return null;

  const callIdentityKey =
    activeCall.identityKey && activeCall.identityKey !== activeIdentityKey
      ? activeCall.identityKey
      : null;

  const offAir = isDeafened || isMuted;
  const buttonTitle = isDeafened
    ? t("voice_deafened", { channel: activeCall.channel.identifier })
    : isMuted
      ? t("voice_muted", { channel: activeCall.channel.identifier })
      : t("voice_in_call", { channel: activeCall.channel.identifier });

  return (
    <div ref={ref} className="relative flex w-full justify-center">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        title={buttonTitle}
        aria-expanded={menuOpen}
        className={`flex w-[46px] flex-col items-center gap-1 rounded-[14px] border py-1.5 transition-colors ${
          offAir
            ? "border-danger/45 bg-danger/15 text-danger"
            : "border-success/45 bg-success/15 text-success"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            offAir ? "bg-danger" : "animate-pulse bg-success"
          }`}
        />
        {isDeafened ? (
          <HeadphonesOffIcon size={15} />
        ) : isMuted ? (
          <MicOffIcon size={15} />
        ) : (
          <HeadphonesIcon size={15} />
        )}
        {isCameraEnabled && <VideoIcon size={13} className="text-accent" />}
      </button>

      {menuOpen && (
        <div className="animate-menu-in absolute bottom-0 left-full ml-2 w-52 rounded-lg border border-line bg-overlay py-1 shadow-soft-lg z-50">
          <div className="border-b border-line px-3 py-2">
            <p className="text-xs font-semibold text-success">{t("voice_connected")}</p>
            <p className="truncate text-sm font-medium text-fg">#{activeCall.channel.identifier}</p>
          </div>

          <MenuItem onClick={toggleMute} className="flex items-center gap-2">
            {isMuted ? <MicOffIcon size={14} /> : <MicrophoneIcon size={14} />}
            {isMuted ? t("unmute") : t("mute")}
          </MenuItem>

          <MenuItem onClick={toggleDeafen} className="flex items-center gap-2">
            {isDeafened ? <HeadphonesOffIcon size={14} /> : <HeadphonesIcon size={14} />}
            {isDeafened ? t("undeafen") : t("deafen")}
          </MenuItem>

          <MenuItem
            onClick={() => setCameraEnabled(!isCameraEnabled)}
            className="flex items-center gap-2"
          >
            {isCameraEnabled ? <VideoOffIcon size={14} /> : <VideoIcon size={14} />}
            {isCameraEnabled ? t("camera_off") : t("camera_on")}
          </MenuItem>

          <div className="border-t border-line">
            {callIdentityKey ? (
              <button
                onClick={() => {
                  closeMenu();
                  void requestIdentitySwitch(callIdentityKey, {
                    to: "/$communityId/$channelId",
                    params: {
                      communityId: activeCall.communityId,
                      channelId: activeCall.channel.identifier,
                    },
                  });
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface"
              >
                {t("return_to_channel")}
              </button>
            ) : (
              <Link
                to="/$communityId/$channelId"
                params={{
                  communityId: activeCall.communityId,
                  channelId: activeCall.channel.identifier,
                }}
                onClick={closeMenu}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface"
              >
                {t("return_to_channel")}
              </Link>
            )}
          </div>
          <div className="border-t border-line">
            <button
              onClick={() => {
                leave();
                closeMenu();
              }}
              className="w-full px-3 py-2 text-left text-sm text-danger hover:bg-surface"
            >
              {t("leave_call")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommunityRailNav({ children }: { children: ReactNode }) {
  const { navOpen } = useMobileNav();
  return (
    <nav
      className={cn(
        `group/nav flex ${isManagedIdentityMode() ? "w-[72px]" : "w-16"} flex-col items-center gap-2.5 bg-rail py-3`,
        "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:transition-transform",
        navOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        "md:static",
      )}
    >
      {children}
    </nav>
  );
}

function NavScrim() {
  const { navOpen, closeNav } = useMobileNav();
  if (!navOpen) return null;
  return (
    <div
      data-testid="mobile-nav-scrim"
      onClick={closeNav}
      className="fixed inset-0 z-30 bg-black/50 md:hidden"
    />
  );
}

function AppShell() {
  const { t: tConv } = useTranslation("conversation");
  const { t: tCommon } = useTranslation("common");
  const { user, token } = useAuth();
  const isAdmin = user?.roles?.includes("ROLE_ADMIN") ?? false;
  const serverInfo = useServerInfo();

  const [setupDismissed, setSetupDismissed] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const needsSetup = isAdmin && serverInfo != null && !serverInfo.adminOnboardingComplete;
  const needsWelcome = !isAdmin && user != null && !user.onboardedAt;

  const { data: deletionStatus } = useAccountDeletionStatus(!!token);
  const isPendingDeletion = deletionStatus?.pending === true;

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const el = document.getElementById("main-content");
    const active = document.activeElement as HTMLElement | null;
    const typing =
      active?.tagName === "INPUT" ||
      active?.tagName === "TEXTAREA" ||
      active?.isContentEditable === true;
    if (el && !typing) el.focus({ preventScroll: true });
  }, [pathname]);

  useUserNotificationsMercure();
  useUserEventsMercure();
  useConversationActivityMercure(user?.id);
  usePresenceOfflineOnUnload(!!token);
  useWebPush(!!token);

  const { data: unreadData } = useQuery({
    queryKey: queryKeys.notificationUnreadCounts(),
    queryFn: fetchUnreadCounts,
    staleTime: Infinity,
    enabled: !!token && !isPendingDeletion,
  });
  const unreadCounts = unreadData?.counts ?? {};

  if (isPendingDeletion) {
    return <AccountPendingDeletionGate purgeAt={deletionStatus?.purgeAt} />;
  }

  return (
    <AuthModalProvider>
      {({ modal, close, switchToRegister, switchToLogin }) => (
        <AudioCallProvider>
          <MobileNavProvider>
            <MessagePopoverProvider>
              <div className="flex h-dvh flex-col bg-canvas text-fg">
                <a
                  href="#main-content"
                  className="sr-only z-[200] rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
                >
                  {tCommon("skip_to_content")}
                </a>
                <SetupAttentionBanner isAdmin={isAdmin} />
                <div className="flex min-h-0 flex-1">
                  <NavScrim />
                  <CommunityRailNav>
                    {token && (
                      <Link
                        to="/dm"
                        title={tConv("direct_messages")}
                        className="relative flex h-[42px] w-[42px] items-center justify-center rounded-[13px] bg-surface text-fg-muted hover:bg-raised hover:text-fg"
                        activeProps={{
                          "aria-current": "page",
                          className:
                            "relative flex h-[42px] w-[42px] items-center justify-center rounded-[13px] bg-accent-gradient text-on-accent shadow-glow ring-2 ring-white ring-offset-2 ring-offset-rail",
                        }}
                        activeOptions={{ exact: false }}
                      >
                        <ChatBubbleIcon size={20} />
                        {(() => {
                          const badge = unreadCounts["dm"] ?? 0;
                          if (badge === 0) return null;
                          return (
                            <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[0.625rem] font-bold text-white ring-2 ring-rail">
                              <span className="block cap-trim">{badge > 9 ? "9+" : badge}</span>
                            </span>
                          );
                        })()}
                      </Link>
                    )}
                    <DesktopRailGroups>
                      <CommunityRail
                        unreadCounts={unreadCounts}
                        renderTileExtra={(c) => (
                          <CommunityVoiceIndicator communityIdentifier={c.identifier} />
                        )}
                      />
                    </DesktopRailGroups>
                    <ConnectionNotificationBridge />
                    <div className="mt-auto" />
                    <ActiveVoiceButton />
                    <UserProfileButton />
                  </CommunityRailNav>

                  {/* PersistentAudioRoom renders the routed Outlet — must mount even when voice is disabled */}
                  <div
                    id="main-content"
                    tabIndex={-1}
                    className="relative flex min-w-0 flex-1 overflow-hidden focus:outline-none"
                  >
                    <PersistentAudioRoom voiceEnabled={serverInfo?.voiceEnabled ?? false} />
                  </div>
                </div>
              </div>
            </MessagePopoverProvider>
          </MobileNavProvider>
          {modal === "login" && (
            <LoginModal
              serverInfo={serverInfo}
              onClose={close}
              onSuccess={close}
              onSwitchToRegister={switchToRegister}
            />
          )}
          {modal === "register" && (
            <RegisterModal
              serverInfo={serverInfo}
              onClose={close}
              onSwitchToLogin={switchToLogin}
            />
          )}
          {needsSetup && !setupDismissed && <SetupWizard onClose={() => setSetupDismissed(true)} />}
          {needsWelcome && !welcomeDismissed && (
            <WelcomeWizard onClose={() => setWelcomeDismissed(true)} />
          )}
        </AudioCallProvider>
      )}
    </AuthModalProvider>
  );
}
