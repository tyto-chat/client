import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/icons";
import { useNotification } from "@/context/NotificationContext";
import { getApiErrorMessage } from "@/api/client";
import type { Webhook, WebhookTrigger, CreateWebhookBody } from "@/api/webhooks";
import {
  useWebhooks,
  useWebhookTriggers,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useRegenerateSecret,
  useSendTestWebhook,
} from "@/queries/webhookQueries";
import { triggerLabelByKey } from "@/utils/webhookTriggerLabel";
import { SecretRevealModal } from "./SecretRevealModal";
import { WebhookForm, type WebhookFormSubmit } from "./WebhookForm";
import { WebhookDeliveriesTable } from "./WebhookDeliveriesTable";

type ModalState =
  | { kind: "create" }
  | { kind: "edit"; webhook: Webhook }
  | { kind: "deliveries"; webhook: Webhook }
  | { kind: "delete"; webhook: Webhook }
  | { kind: "secret"; secret: string }
  | { kind: "regen_confirm"; webhook: Webhook }
  | { kind: "reenable_confirm"; webhook: Webhook };

function TriggerLabel({
  triggerKey,
  triggers,
}: {
  triggerKey: string;
  triggers: WebhookTrigger[];
}) {
  const { t } = useTranslation("admin");
  return <span>{triggerLabelByKey(t, triggerKey, triggers)}</span>;
}

function ActiveToggle({
  webhook,
  onToggle,
}: {
  webhook: Webhook;
  onToggle: (webhook: Webhook) => void;
}) {
  const { t } = useTranslation("admin");
  const label = webhook.isActive ? t("webhook_state_active") : t("webhook_state_inactive");

  return (
    <button
      type="button"
      role="switch"
      aria-checked={webhook.isActive}
      aria-label={label}
      onClick={() => onToggle(webhook)}
      className={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors ${
        webhook.isActive ? "bg-[var(--accent)]" : "bg-raised"
      }`}
      title={label}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-canvas shadow transition-transform ${
          webhook.isActive ? "left-4" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function WebhookList() {
  const { t } = useTranslation("admin");
  const { notify } = useNotification();

  const { data: webhooks, isLoading: loadingWebhooks } = useWebhooks();
  const { data: triggers = [], isLoading: loadingTriggers } = useWebhookTriggers();

  const createMutation = useCreateWebhook();
  const updateMutation = useUpdateWebhook();
  const deleteMutation = useDeleteWebhook();
  const regenMutation = useRegenerateSecret();
  const testMutation = useSendTestWebhook();

  const [modal, setModal] = useState<ModalState | null>(null);

  function closeModal() {
    setModal(null);
  }

  function handleToggleActive(webhook: Webhook) {
    if (!webhook.isActive) {
      setModal({ kind: "reenable_confirm", webhook });
    } else {
      updateMutation.mutate(
        { id: webhook.id, body: { isActive: false } },
        {
          onSuccess: () => notify(t("webhook_updated"), "success"),
          onError: (err) => notify(getApiErrorMessage(err) ?? t("webhook_update_failed"), "error"),
        },
      );
    }
  }

  async function handleReenable(webhook: Webhook, replayPending: boolean) {
    closeModal();
    try {
      await updateMutation.mutateAsync({
        id: webhook.id,
        body: { isActive: true, replayPending },
      });
      notify(t("webhook_updated"), "success");
    } catch (err) {
      notify(getApiErrorMessage(err) ?? t("webhook_update_failed"), "error");
    }
  }

  async function handleCreate(values: WebhookFormSubmit) {
    try {
      const result = await createMutation.mutateAsync(values as CreateWebhookBody);
      closeModal();
      setModal({ kind: "secret", secret: result.secret });
      notify(t("webhook_created"), "success");
    } catch (err) {
      notify(getApiErrorMessage(err) ?? t("webhook_create_failed"), "error");
    }
  }

  async function handleEdit(webhook: Webhook, values: WebhookFormSubmit) {
    try {
      await updateMutation.mutateAsync({ id: webhook.id, body: values });
      closeModal();
      notify(t("webhook_updated"), "success");
    } catch (err) {
      notify(getApiErrorMessage(err) ?? t("webhook_update_failed"), "error");
    }
  }

  async function handleDelete(webhook: Webhook) {
    try {
      await deleteMutation.mutateAsync(webhook.id);
      closeModal();
      notify(t("webhook_deleted"), "success");
    } catch (err) {
      notify(getApiErrorMessage(err) ?? t("webhook_delete_failed"), "error");
    }
  }

  async function handleRegen(webhook: Webhook) {
    try {
      const result = await regenMutation.mutateAsync(webhook.id);
      closeModal();
      setModal({ kind: "secret", secret: result.secret });
    } catch (err) {
      notify(getApiErrorMessage(err) ?? t("webhook_regen_failed"), "error");
    }
  }

  async function handleSendTest(webhook: Webhook) {
    try {
      await testMutation.mutateAsync(webhook.id);
      notify(t("webhook_test_sent"), "success");
    } catch (err) {
      notify(getApiErrorMessage(err) ?? t("webhook_test_failed"), "error");
    }
  }

  const isLoading = loadingWebhooks || loadingTriggers;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t("nav_webhooks")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("webhooks_intro")}</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ kind: "create" })}
          className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
        >
          {t("webhook_create")}
        </button>
      </header>

      <div className="overflow-x-auto rounded-lg bg-canvas ring-1 ring-inset ring-line">
        <table className="min-w-full text-sm">
          <thead className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">
            <tr>
              <th className="px-4 py-3">{t("webhook_col_name")}</th>
              <th className="px-4 py-3">{t("webhook_col_trigger")}</th>
              <th className="px-4 py-3">{t("webhook_col_url")}</th>
              <th className="px-4 py-3">{t("webhook_col_active")}</th>
              <th className="px-4 py-3">{t("webhook_col_pending")}</th>
              <th className="px-4 py-3 text-right">{t("col_actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-fg-muted">
                  <Spinner size={16} /> {t("loading")}
                </td>
              </tr>
            )}
            {!isLoading && (webhooks?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-fg-muted">
                  {t("webhooks_empty")}
                </td>
              </tr>
            )}
            {webhooks?.map((webhook) => (
              <tr key={webhook.id} className="hover:bg-surface">
                <td className="px-4 py-3 font-medium">
                  {webhook.name}
                  {webhook.disabledReason && (
                    <span
                      className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      title={webhook.disabledReason}
                    >
                      {t("webhook_badge_disabled")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-fg-muted">
                  <TriggerLabel triggerKey={webhook.triggerKey} triggers={triggers} />
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-fg-muted">
                  <span title={webhook.url}>{webhook.url}</span>
                </td>
                <td className="px-4 py-3">
                  <ActiveToggle webhook={webhook} onToggle={handleToggleActive} />
                </td>
                <td className="px-4 py-3">
                  {webhook.pendingCount > 0 ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {webhook.pendingCount}
                    </span>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => void handleSendTest(webhook)}
                      disabled={testMutation.isPending}
                      className="text-xs text-fg-muted hover:text-fg dark:hover:text-white"
                    >
                      {t("webhook_action_test")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ kind: "deliveries", webhook })}
                      className="text-xs text-fg-muted hover:text-fg dark:hover:text-white"
                    >
                      {t("webhook_action_deliveries")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ kind: "edit", webhook })}
                      className="text-xs text-fg-muted hover:text-fg dark:hover:text-white"
                    >
                      {t("action_view")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ kind: "regen_confirm", webhook })}
                      className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400"
                    >
                      {t("webhook_action_regen")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ kind: "delete", webhook })}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      {t("action_delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.kind === "create" && (
        <FormModal title={t("webhook_create_title")} onClose={closeModal}>
          <WebhookForm
            triggers={triggers}
            onSubmit={(v) => void handleCreate(v)}
            onCancel={closeModal}
            isSubmitting={createMutation.isPending}
          />
        </FormModal>
      )}
      {modal?.kind === "edit" && (
        <FormModal title={t("webhook_edit_title")} onClose={closeModal}>
          <WebhookForm
            initial={modal.webhook}
            triggers={triggers}
            onSubmit={(v) => void handleEdit(modal.webhook, v)}
            onCancel={closeModal}
            isSubmitting={updateMutation.isPending}
          />
        </FormModal>
      )}
      {modal?.kind === "deliveries" && (
        <FormModal
          title={t("webhook_deliveries_title", { name: modal.webhook.name })}
          onClose={closeModal}
          wide
        >
          <WebhookDeliveriesTable webhookId={modal.webhook.id} />
        </FormModal>
      )}
      {modal?.kind === "delete" && (
        <Modal
          title={
            <span className="text-red-700 dark:text-red-300">
              {t("webhook_delete_title", { name: modal.webhook.name })}
            </span>
          }
          onClose={closeModal}
        >
          {(close) => (
            <>
              <p className="mb-6 text-sm text-fg">{t("webhook_delete_intro")}</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="text-sm text-fg-muted hover:text-fg"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => void handleDelete(modal.webhook)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {deleteMutation.isPending ? t("deleting") : t("confirm_delete")}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
      {modal?.kind === "regen_confirm" && (
        <Modal
          title={
            <span className="text-amber-700 dark:text-amber-400">{t("webhook_regen_title")}</span>
          }
          onClose={closeModal}
        >
          {(close) => (
            <>
              <p className="mb-6 text-sm text-fg">{t("webhook_regen_warning")}</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="text-sm text-fg-muted hover:text-fg"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  disabled={regenMutation.isPending}
                  onClick={() => void handleRegen(modal.webhook)}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
                >
                  {regenMutation.isPending ? t("webhook_regen_pending") : t("webhook_action_regen")}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
      {modal?.kind === "reenable_confirm" && (
        <Modal title={t("webhook_reenable_title")} onClose={closeModal}>
          {(close) => (
            <>
              <p className="mb-2 text-sm text-fg">
                {t("webhook_reenable_body", { count: modal.webhook.pendingCount })}
              </p>
              {modal.webhook.pendingCount > 0 && (
                <p className="mb-4 text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {t("webhook_reenable_replay_prompt", { count: modal.webhook.pendingCount })}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="text-sm text-fg-muted hover:text-fg"
                >
                  {t("cancel")}
                </button>
                {modal.webhook.pendingCount > 0 && (
                  <button
                    type="button"
                    disabled={updateMutation.isPending}
                    onClick={() => void handleReenable(modal.webhook, false)}
                    className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-fg hover:bg-surface disabled:opacity-40"
                  >
                    {t("webhook_reenable_skip_replay")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={updateMutation.isPending}
                  onClick={() => void handleReenable(modal.webhook, modal.webhook.pendingCount > 0)}
                  className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
                >
                  {modal.webhook.pendingCount > 0
                    ? t("webhook_reenable_yes_replay", { count: modal.webhook.pendingCount })
                    : t("webhook_reenable_enable")}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
      {modal?.kind === "secret" && <SecretRevealModal secret={modal.secret} onClose={closeModal} />}
    </div>
  );
}

function FormModal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose} size={wide ? "2xl" : "lg"}>
      {() => children}
    </Modal>
  );
}
