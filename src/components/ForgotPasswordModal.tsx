import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requestPasswordReset, confirmPasswordReset } from "@/api/users";
import { useNotification } from "@/context/NotificationContext";
import { TextInput } from "@/components/TextInput";
import { ModalFooter } from "@/components/ModalFooter";
import { Modal } from "@/components/Modal";

export function ForgotPasswordModal({
  initialEmail,
  onClose,
  onSuccess,
}: {
  initialEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation(["auth", "common"]);
  const { notify } = useNotification();
  const [step, setStep] = useState<"email" | "token">("email");
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState({ newPassword: false, confirmPassword: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const isValid = token.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      notify(t("token_sent"), "success");
      setStep("token");
    } catch {
      notify(t("failed_send_reset"), "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      await confirmPasswordReset(email, token, newPassword);
      onSuccess();
    } catch {
      notify(t("invalid_token"), "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={t("reset_password_modal_title")} onClose={onClose} size="sm">
      {(close) =>
        step === "email" ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <p className="text-sm text-fg-muted">{t("enter_email_hint")}</p>
            <TextInput
              type="email"
              label={t("common:email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <ModalFooter
              onCancel={close}
              submitLabel={t("send_token")}
              pendingLabel={t("sending")}
              isPending={isSubmitting}
            />
          </form>
        ) : (
          <form onSubmit={handleTokenSubmit} className="animate-message-in space-y-4">
            <p className="text-sm text-fg-muted">{t("enter_token_hint", { email })}</p>
            <TextInput
              label={t("reset_token_label")}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
            <TextInput
              label={t("new_password")}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, newPassword: true }))}
              required
              error={touched.newPassword && tooShort ? t("password_too_short") : undefined}
            />
            <TextInput
              label={t("confirm_new_password")}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
              required
              error={touched.confirmPassword && mismatch ? t("passwords_dont_match") : undefined}
            />
            <ModalFooter
              onCancel={() => setStep("email")}
              cancelLabel={t("common:back")}
              submitLabel={t("reset_password_submit")}
              pendingLabel={t("resetting")}
              isPending={isSubmitting}
              disabled={!isValid}
            />
          </form>
        )
      }
    </Modal>
  );
}
