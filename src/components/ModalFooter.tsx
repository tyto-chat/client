import { useTranslation } from "react-i18next";

interface ModalFooterProps {
  onCancel: () => void;
  cancelLabel?: string;
  submitLabel: string;
  isPending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  destructive?: boolean;
  submitTestId?: string;
}

export function ModalFooter({
  onCancel,
  cancelLabel,
  submitLabel,
  isPending = false,
  pendingLabel,
  disabled = false,
  destructive = false,
  submitTestId,
}: ModalFooterProps) {
  const { t } = useTranslation("common");
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-4 py-2 text-sm text-fg-muted hover:text-fg dark:hover:text-white"
      >
        {cancelLabel ?? t("cancel")}
      </button>
      <button
        type="submit"
        data-testid={submitTestId}
        disabled={isPending || disabled}
        className={
          destructive
            ? "rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger/90 disabled:opacity-40"
            : "rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
        }
      >
        {isPending && pendingLabel ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}
