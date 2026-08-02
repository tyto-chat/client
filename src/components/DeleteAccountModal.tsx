import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { ModalFooter } from "@/components/ModalFooter";
import { TextInput } from "@/components/TextInput";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useRequestAccountDeletion } from "@/queries/accountDeletionQueries";
import { useAuth } from "@/hooks/useAuth";
import { useNotification } from "@/context/NotificationContext";

interface Props {
  onClose: () => void;
  onScheduled?: () => void;
}

export function DeleteAccountModal({ onClose, onScheduled }: Props) {
  const { t } = useTranslation(["settings", "common"]);
  const { user } = useAuth();
  const { notify } = useNotification();
  const requestDeletion = useRequestAccountDeletion();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const email = user?.email ?? "";
  const confirmed = typed.trim().toLowerCase() === email.toLowerCase();

  async function onSubmit() {
    setError(null);
    try {
      await requestDeletion.mutateAsync();
      onScheduled?.();
      onClose();
    } catch {
      setError(t("delete_account_request_failed"));
      notify(t("delete_account_request_failed"), "error");
    }
  }

  return (
    <Modal title={t("delete_account_dialog_title")} onClose={onClose} size="md">
      {(close) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
            {t("delete_account_warning")}
          </p>
          <div>
            <label className="mb-1 block text-sm text-fg-muted">
              {t("delete_account_confirm_label", { email })}
            </label>
            <TextInput
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email}
              autoFocus
            />
          </div>
          {error && <ErrorMessage message={error} />}
          <ModalFooter
            onCancel={close}
            submitLabel={t("delete_account_confirm_button")}
            isPending={requestDeletion.isPending}
            disabled={!confirmed}
          />
        </form>
      )}
    </Modal>
  );
}
