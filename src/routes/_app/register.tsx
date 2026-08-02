import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTranslation } from "react-i18next";
import { RegisterModal } from "@/components/RegisterModal";

export const Route = createFileRoute("/_app/register")({
  beforeLoad: ({ context }) => {
    if (context.auth.token) {
      throw redirect({ to: "/" });
    }
  },
  component: RegisterPage,
});

function RegisterPage() {
  const { t } = useTranslation("auth");
  useDocumentTitle(t("create_account_title"));
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
    <RegisterModal
      serverInfo={serverInfo}
      onClose={handleClose}
      onSwitchToLogin={() => void navigate({ to: "/login" })}
    />
  );
}
