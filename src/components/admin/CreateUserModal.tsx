import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useTranslation } from "react-i18next";
import { useCreateAdminUser } from "@/queries/adminUserQueries";
import { useAdminCommunities } from "@/queries/adminCommunityQueries";
import { useNotification } from "@/context/NotificationContext";
import { getApiErrorMessage } from "@/api/client";

interface Props {
  onClose: () => void;
}

export function CreateUserModal({ onClose }: Props) {
  const { t } = useTranslation("admin");
  const { notify } = useNotification();
  const createMutation = useCreateAdminUser();
  const { data: communitiesData } = useAdminCommunities({ perPage: 100 });

  const [isBot, setIsBot] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleCommunity(id: number) {
    setSelectedCommunityIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  const isSubmitDisabled =
    name.trim() === "" || (!isBot && email.trim() === "") || createMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createMutation.mutateAsync({
        isBot,
        name: name.trim(),
        email: isBot ? undefined : email.trim(),
        communityIds: selectedCommunityIds.length > 0 ? selectedCommunityIds : undefined,
      });
      notify(
        isBot
          ? t("bot_created", { name: name.trim() })
          : t("user_invited", { email: email.trim() }),
        "success",
      );
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err) ?? t("save_failed"));
    }
  }

  return (
    <Modal title={t("create_user_title")} onClose={onClose}>
      {(close) => (
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {t("account_kind")}
            </span>
            <div className="inline-flex rounded-md border border-line">
              <button
                type="button"
                onClick={() => setIsBot(false)}
                className={`flex-1 rounded-l-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                  !isBot
                    ? "bg-[var(--accent-strong)] text-[var(--accent-on)]"
                    : "bg-canvas text-fg hover:bg-surface"
                }`}
              >
                {t("kind_user")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsBot(true);
                  setSelectedCommunityIds([]);
                }}
                className={`flex-1 rounded-r-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                  isBot
                    ? "bg-[var(--accent-strong)] text-[var(--accent-on)]"
                    : "bg-canvas text-fg hover:bg-surface"
                }`}
              >
                {t("kind_bot")}
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {t("user_name")}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm"
            />
          </label>
          {!isBot && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                {t("user_email")}
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm"
              />
            </label>
          )}
          {!isBot && (communitiesData?.rows ?? []).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                {t("user_communities")}
              </span>
              <div className="max-h-48 overflow-y-auto rounded-md border border-line">
                {communitiesData!.rows.map((community) => (
                  <label
                    key={community.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-surface"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCommunityIds.includes(community.id)}
                      onChange={() => toggleCommunity(community.id)}
                      className="accent-[var(--accent)]"
                    />
                    <span>{community.name}</span>
                    <span className="ml-auto text-xs text-fg-subtle">{community.identifier}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={close}
              className="text-sm text-fg-muted hover:text-fg dark:hover:text-white"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-[var(--accent-on)] disabled:opacity-40"
            >
              {createMutation.isPending
                ? t("saving")
                : t(isBot ? "create_bot_submit" : "create_user_submit")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
