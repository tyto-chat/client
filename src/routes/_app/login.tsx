import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTranslation } from "react-i18next";
import { LoginModal } from "@/components/LoginModal";

export const Route = createFileRoute("/_app/login")({
  beforeLoad: ({ context }) => {
    if (context.auth.token) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation("auth");
  useDocumentTitle(t("sign_in_title"));
  const navigate = useNavigate();
  const { serverInfo } = Route.useRouteContext();

  function handleClose() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      void navigate({ to: "/" });
    }
  }

  return (
    <LoginModal
      serverInfo={serverInfo}
      onClose={handleClose}
      onSwitchToRegister={() => void navigate({ to: "/register" })}
    />
  );
}
