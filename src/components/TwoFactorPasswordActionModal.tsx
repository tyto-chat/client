import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { TextInput } from "@/components/TextInput";
import { ModalFooter } from "@/components/ModalFooter";
import { ErrorMessage } from "@/components/ErrorMessage";
import { RecoveryCodesDisplay } from "@/components/TwoFactorSetupModal";
import { useDisableTwoFactor, useRegenerateRecoveryCodes } from "@/queries/twoFactorQueries";
import { useNotification } from "@/context/NotificationContext";
import { apiErrorText } from "@/api/client";

export function TwoFactorPasswordActionModal({
  action,
  onClose,
}: {
  action: "disable" | "regenerate";
  onClose: () => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const { notify } = useNotification();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const disable = useDisableTwoFactor();
  const regenerate = useRegenerateRecoveryCodes();
  const isPending = action === "disable" ? disable.isPending : regenerate.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (action === "disable") {
        await disable.mutateAsync(password);
        notify(t("two_factor_disabled_success"), "success");
        onClose();
      } else {
        const result = await regenerate.mutateAsync(password);
        setRecoveryCodes(result.recoveryCodes);
      }
    } catch (err) {
      setError(apiErrorText(err, t("two_factor_password_failed")));
    }
  }

  const title =
    action === "disable" ? t("two_factor_disable_title") : t("two_factor_regenerate_title");
  const hint =
    action === "disable" ? t("two_factor_disable_hint") : t("two_factor_regenerate_hint");

  return (
    <Modal title={title} onClose={onClose} dismissable={recoveryCodes === null} size="md">
      {(close) =>
        recoveryCodes ? (
          <RecoveryCodesDisplay codes={recoveryCodes} onDone={close} />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-fg-muted">{hint}</p>
            <TextInput
              label={t("two_factor_password_label")}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <ErrorMessage message={error} />
            <ModalFooter
              onCancel={close}
              submitLabel={t(action === "disable" ? "two_factor_disable" : "two_factor_regenerate")}
              pendingLabel={t("common:saving")}
              isPending={isPending}
              disabled={password.length === 0}
              destructive={action === "disable"}
              submitTestId="two-factor-action-submit"
            />
          </form>
        )
      }
    </Modal>
  );
}
