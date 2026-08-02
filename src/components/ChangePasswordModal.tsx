import { useState } from "react";
import { useTranslation } from "react-i18next";
import { changePassword } from "@/api/users";
import { Modal } from "@/components/Modal";
import { TextInput } from "@/components/TextInput";
import { ModalFooter } from "@/components/ModalFooter";
import { ErrorMessage } from "@/components/ErrorMessage";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["auth", "common"]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState({ newPassword: false, confirmPassword: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const isValid =
    newPassword.length >= 8 && newPassword === confirmPassword && currentPassword.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    setError("");
    try {
      await changePassword({ currentPassword, newPassword });
      onClose();
    } catch {
      setError(t("change_password_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t("change_password_title")} onClose={onClose}>
      {(close) => (
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextInput
            label={t("current_password")}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <TextInput
            label={t("new_password")}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onBlur={() => setTouched((s) => ({ ...s, newPassword: true }))}
            required
            error={touched.newPassword && tooShort ? t("password_too_short") : undefined}
          />
          <TextInput
            label={t("confirm_new_password")}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onBlur={() => setTouched((s) => ({ ...s, confirmPassword: true }))}
            required
            error={touched.confirmPassword && mismatch ? t("passwords_dont_match") : undefined}
          />
          <ErrorMessage message={error} />
          <ModalFooter
            onCancel={close}
            submitLabel={t("change_password_submit")}
            pendingLabel={t("common:saving")}
            isPending={saving}
            disabled={!isValid}
          />
        </form>
      )}
    </Modal>
  );
}
