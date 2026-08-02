import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchCommunities } from "@/api/communities";
import { fetchUserPreferences } from "@/api/userPreferences";
import { fetchMe } from "@/api/users";
import { queryKeys } from "@/queries/queryKeys";
import { takeLastLocation, type LastLocation } from "@/utils/lastLocation";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import { useServerInfo } from "@/hooks/useServerInfo";
import { UserProfileButton } from "@/components/UserProfileButton";
import { CreateCommunityModal } from "@/components/CreateCommunityModal";
import { AuthModalProvider } from "@/context/AuthModalContext";
import { LoginModal } from "@/components/LoginModal";
import { RegisterModal } from "@/components/RegisterModal";
import { SetupWizard } from "@/components/onboarding/SetupWizard";
import { TytoMark } from "@/components/TytoMark";

export const Route = createFileRoute("/")({
  loader: async ({ context: { queryClient, auth } }) => {
    let last: LastLocation | null = null;
    if (auth.token) {
      try {
        const [me, prefs] = await Promise.all([fetchMe(), fetchUserPreferences()]);
        queryClient.setQueryData(queryKeys.userPreferences(), prefs);
        if (prefs.resumeLastLocation !== false) {
          last = takeLastLocation(me.id);
        }
      } catch {
        last = null;
      }
    }
    if (last?.kind === "channel") {
      throw redirect({
        to: "/$communityId/$channelId",
        params: { communityId: last.communityId, channelId: last.channelId },
      });
    }
    if (last?.kind === "dm") {
      throw redirect({
        to: "/dm/$conversationId",
        params: { conversationId: last.conversationId },
      });
    }

    const communities = await fetchCommunities();
    queryClient.setQueryData(queryKeys.communities(), communities);
    const firstCommunity = communities[0];
    if (firstCommunity) {
      throw redirect({
        to: "/$communityId",
        params: { communityId: firstCommunity.identifier },
      });
    }
    return {};
  },
  component: NoCommunitiesPage,
});

function NoCommunitiesPage() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation("community");
  const serverInfo = useServerInfo();
  const router = useRouter();
  const isAdmin = user?.roles?.includes("ROLE_ADMIN") ?? false;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const needsSetup = isAdmin && serverInfo != null && !serverInfo.adminOnboardingComplete;

  return (
    <AuthModalProvider>
      {({ modal, close, switchToRegister, switchToLogin }) => (
        <div className="flex h-dvh items-center justify-center bg-surface text-fg-muted">
          <button
            onClick={toggle}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-lg bg-surface text-fg-muted hover:bg-raised hover:text-fg dark:hover:text-white"
          >
            {theme === "dark" ? "☀" : "🌕"}
          </button>
          <div className="flex flex-col items-center gap-4">
            <TytoMark size={56} />
            {t("no_communities")}
            {isAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
              >
                {t("create_community_title")}
              </button>
            )}
          </div>
          <div className="absolute bottom-3 left-3">
            <UserProfileButton />
          </div>
          {showCreateModal && <CreateCommunityModal onClose={() => setShowCreateModal(false)} />}
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
          {needsSetup && !setupDismissed && (
            <SetupWizard
              onClose={() => {
                setSetupDismissed(true);
                void router.invalidate();
              }}
            />
          )}
        </div>
      )}
    </AuthModalProvider>
  );
}
