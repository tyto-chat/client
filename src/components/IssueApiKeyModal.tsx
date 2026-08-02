import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { ModalFooter } from "@/components/ModalFooter";
import { TextInput } from "@/components/TextInput";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useAuth } from "@/hooks/useAuth";
import { useNotification } from "@/context/NotificationContext";
import type { ApiKeyScope, IssuedApiKey } from "@/types/api";
import type { IssueApiKeyPayload } from "@/api/apiKeys";

type ExpiryChoice = "30d" | "90d" | "1y" | "never";

interface ResourceRow {
  key: string;
  read?: ApiKeyScope;
  write?: ApiKeyScope;
  adminOnly?: boolean;
}

const RESOURCES: ResourceRow[] = [
  { key: "profile", read: "profile:read", write: "profile:write" },
  { key: "messages", read: "messages:read", write: "messages:write" },
  { key: "conversations", read: "conversations:read", write: "conversations:write" },
  { key: "communities", read: "communities:read", write: "communities:write" },
  { key: "notifications", read: "notifications:read", write: "notifications:write" },
  { key: "push", write: "push:write" },
  { key: "moderation", read: "moderation:read", write: "moderation:write" },
];

function expiresAtFor(choice: ExpiryChoice): string | null {
  if (choice === "never") return null;
  const now = new Date();
  switch (choice) {
    case "30d":
      now.setDate(now.getDate() + 30);
      break;
    case "90d":
      now.setDate(now.getDate() + 90);
      break;
    case "1y":
      now.setFullYear(now.getFullYear() + 1);
      break;
  }
  return now.toISOString();
}

interface IssueApiKeyModalProps {
  onClose: () => void;
  issueMutation: {
    mutateAsync: (payload: IssueApiKeyPayload) => Promise<IssuedApiKey>;
    isPending: boolean;
  };
}

export function IssueApiKeyModal({ onClose, issueMutation }: IssueApiKeyModalProps) {
  const { t } = useTranslation(["settings", "common"]);
  const { user } = useAuth();
  const { notify } = useNotification();
  const isAdmin = (user?.roles ?? []).includes("ROLE_ADMIN");

  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<ExpiryChoice>("90d");
  const [scopes, setScopes] = useState<Set<ApiKeyScope>>(new Set());
  const [adminScope, setAdminScope] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedScopes = useMemo<ApiKeyScope[]>(() => {
    const out = Array.from(scopes);
    if (adminScope && isAdmin) out.push("admin");
    return out;
  }, [scopes, adminScope, isAdmin]);

  function toggleScope(scope: ApiKeyScope) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  function selectAllRead() {
    const next = new Set<ApiKeyScope>();
    for (const r of RESOURCES) if (r.read) next.add(r.read);
    setScopes(next);
  }

  function reset() {
    setScopes(new Set());
    setAdminScope(false);
  }

  async function onSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(t("api_key_name_label"));
      return;
    }
    if (selectedScopes.length === 0) {
      setError(t("api_key_permissions_required"));
      return;
    }
    try {
      const result = await issueMutation.mutateAsync({
        name: name.trim(),
        scopes: selectedScopes,
        expiresAt: expiresAtFor(expiry),
      });
      setIssued(result);
    } catch {
      notify(t("api_key_create_failed"), "error");
    }
  }

  async function copyToken() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.plainToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal
      title={issued ? t("api_key_token_shown_once_title") : t("api_key_create_title")}
      onClose={onClose}
      dismissable={!issued}
      size="md"
    >
      {(close) =>
        issued ? (
          <div className="flex flex-col gap-4">
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
              {t("api_key_token_shown_once_warning")}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all break-all rounded-lg bg-surface px-3 py-2 font-mono text-xs text-fg dark:text-white">
                {issued.plainToken}
              </code>
              <button
                type="button"
                onClick={() => void copyToken()}
                className="rounded-lg bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-sm font-medium hover:bg-surface"
              >
                {copied ? t("api_key_copied") : t("api_key_copy")}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIssued(null);
                  close();
                }}
                className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
              >
                {t("api_key_saved")}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="mb-1 block text-sm text-fg-muted">{t("api_key_name_label")}</label>
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("api_key_name_placeholder")}
                maxLength={64}
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-fg-muted">
                {t("api_key_expiry_label")}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(["30d", "90d", "1y", "never"] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setExpiry(choice)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      expiry === choice
                        ? "border-[var(--accent)] bg-[var(--accent-strong)] text-[var(--accent-on)]"
                        : "border-line bg-surface text-fg hover:bg-raised"
                    }`}
                  >
                    {t(`api_key_expiry_${choice}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm text-fg-muted">{t("api_key_permissions")}</label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllRead}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {t("api_key_perm_read")}: ✓
                  </button>
                  <button type="button" onClick={reset} className="text-fg-muted hover:underline">
                    {t("common:reset", { defaultValue: "Reset" })}
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-line">
                {RESOURCES.map((r) => (
                  <div
                    key={r.key}
                    className="flex items-center justify-between border-b border-line px-3 py-2 last:border-0"
                  >
                    <span className="text-sm text-fg">
                      {t(`api_key_resource_${r.key}` as never)}
                    </span>
                    <div className="flex gap-3 text-sm">
                      {r.read && (
                        <label className="flex items-center gap-1 text-fg-muted">
                          <input
                            type="checkbox"
                            data-testid={`api-key-scope-${r.key}-read`}
                            checked={scopes.has(r.read)}
                            onChange={() => toggleScope(r.read as ApiKeyScope)}
                          />
                          {t("api_key_perm_read")}
                        </label>
                      )}
                      {r.write && (
                        <label className="flex items-center gap-1 text-fg-muted">
                          <input
                            type="checkbox"
                            checked={scopes.has(r.write)}
                            onChange={() => toggleScope(r.write as ApiKeyScope)}
                          />
                          {t("api_key_perm_write")}
                        </label>
                      )}
                    </div>
                  </div>
                ))}
                {isAdmin && (
                  <div className="flex flex-col gap-1 border-t border-line bg-red-50 px-3 py-2 dark:bg-red-900/20">
                    <label className="flex items-center justify-between text-sm">
                      <span className="text-fg">{t("api_key_resource_admin")}</span>
                      <input
                        type="checkbox"
                        checked={adminScope}
                        onChange={(e) => setAdminScope(e.target.checked)}
                      />
                    </label>
                    <p className="text-xs text-red-700 dark:text-red-300">
                      {t("api_key_admin_warning")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {error && <ErrorMessage message={error} />}

            <ModalFooter
              onCancel={close}
              submitLabel={t("api_key_create_action")}
              pendingLabel={t("api_key_creating")}
              isPending={issueMutation.isPending}
              disabled={selectedScopes.length === 0 || !name.trim()}
            />
          </form>
        )
      }
    </Modal>
  );
}
