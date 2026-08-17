import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { login as apiLogin } from "@/api/auth";
import { useAuth } from "@/hooks/useAuth";
import { ServerBranding } from "@/components/ServerBranding";
import { LegalFooterLinks, PoweredByTyto } from "@/components/LegalLinks";
import { RegisterForm } from "@/components/RegisterForm";
import { Modal } from "@/components/Modal";
import type { ServerInfo } from "@/types/api";

interface Props {
  serverInfo: ServerInfo | null;
  onClose: () => void;
  onSwitchToLogin: () => void;
}

export function RegisterModal({ serverInfo, onClose, onSwitchToLogin }: Props) {
  const { t } = useTranslation(["auth", "common"]);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleComplete(email: string, password: string) {
    const { token } = await apiLogin(email, password);
    login(token);
    onClose();
    await navigate({ to: "/" });
  }

  return (
    <Modal onClose={onClose} size="md">
      {() => (
        <>
          {serverInfo && <ServerBranding serverInfo={serverInfo} onNavigate={onClose} />}
          <h1 className="mb-4 pr-6 text-2xl font-bold">{t("create_account")}</h1>
          <RegisterForm
            serverInfo={serverInfo}
            onSwitchToLogin={onSwitchToLogin}
            onComplete={handleComplete}
          />
          <div className="mt-4 space-y-1.5">
            <LegalFooterLinks serverInfo={serverInfo} />
            <PoweredByTyto />
          </div>
        </>
      )}
    </Modal>
  );
}
