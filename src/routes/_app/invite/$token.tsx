import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { previewInvite, acceptInvite } from "@/api/communities";
import { queryKeys } from "@/queries/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { useAuthModal } from "@/context/AuthModalContext";
import { useNotification } from "@/context/NotificationContext";

export const Route = createFileRoute("/_app/invite/$token")({
  component: InviteAcceptPage,
});

function InviteAcceptPage() {
  const { token } = Route.useParams();
  const { t } = useTranslation(["community", "auth", "common"]);
  const { user } = useAuth();
  const { openLogin } = useAuthModal();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [joining, setJoining] = useState(false);

  const {
    data: preview,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.invite(token),
    queryFn: () => previewInvite(token),
    retry: false,
    // A dead invite 404s, and the global 404 handler would bounce to "/" before
    // the invalid-invite state below could render.
    meta: { noGlobalRedirect: true },
  });

  async function handleJoin() {
    setJoining(true);
    try {
      const result = await acceptInvite(token);
      await queryClient.invalidateQueries({ queryKey: queryKeys.communities() });
      notify(t("joined_community", { name: result.communityName }), "success");
      await navigate({
        to: "/$communityId",
        params: { communityId: result.communityIdentifier },
      });
    } catch {
      notify(t("invite_join_error"), "error");
      setJoining(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-canvas ring-1 ring-inset ring-line p-6 text-center shadow-sm">
        {isLoading ? (
          <p className="text-sm text-fg-muted">{t("common:loading")}</p>
        ) : isError || !preview ? (
          <>
            <h2 className="text-lg font-semibold text-fg dark:text-white">
              {t("invite_invalid_title")}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{t("invite_invalid_description")}</p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-fg dark:text-white">
              {t("invite_join_title", { name: preview.communityName })}
            </h2>
            {user ? (
              <button
                type="button"
                onClick={handleJoin}
                disabled={joining}
                className="mt-4 w-full rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {joining ? t("invite_joining") : t("invite_join_button")}
              </button>
            ) : (
              <>
                <p className="mt-1 text-sm text-fg-muted">{t("invite_login_to_join")}</p>
                <button
                  type="button"
                  onClick={openLogin}
                  className="mt-4 w-full rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
                >
                  {t("auth:sign_in")}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
