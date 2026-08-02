import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/Modal";
import { ModalFooter } from "@/components/ModalFooter";
import { TextInput } from "@/components/TextInput";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useLeaveCommunity } from "@/queries/communityQueries";
import { useNotification } from "@/context/NotificationContext";
import { ApiError } from "@/api/client";
import { queryKeys } from "@/queries/queryKeys";
import type { PinnedCommunitiesResponse } from "@/types/api";

interface Props {
  communityIdentifier: string;
  communityName: string;
  onClose: () => void;
}

export function LeaveCommunityModal({ communityIdentifier, communityName, onClose }: Props) {
  const { t } = useTranslation(["community", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useNotification();
  const leave = useLeaveCommunity();

  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const confirmed = typed.trim() === communityName.trim();

  async function onSubmit() {
    setError(null);
    try {
      await leave.mutateAsync(communityIdentifier);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const body = e.body as { error?: string } | null;
        setError(body?.error ?? t("leave_community_failed"));
      } else {
        notify(t("leave_community_failed"), "error");
      }
      return;
    }
    onClose();
    notify(t("leave_community_done"), "success");

    const pinned = queryClient.getQueryData<PinnedCommunitiesResponse>(
      queryKeys.pinnedCommunities(),
    );
    const next = pinned?.items.find((p) => p.community.identifier !== communityIdentifier);
    if (next) {
      void navigate({ to: "/$communityId", params: { communityId: next.community.identifier } });
    } else {
      void navigate({ to: "/" });
    }
  }

  return (
    <Modal title={t("leave_community_title")} onClose={onClose} size="md">
      {(close) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-fg">{t("leave_community_warning", { name: communityName })}</p>
          <div>
            <label className="mb-1 block text-sm text-fg-muted">
              {t("leave_community_confirm_label", { name: communityName })}
            </label>
            <TextInput
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={communityName}
              autoFocus
            />
          </div>
          {error && <ErrorMessage message={error} />}
          <ModalFooter
            onCancel={close}
            submitLabel={t("leave_community_action")}
            pendingLabel={t("leave_community_leaving")}
            isPending={leave.isPending}
            disabled={!confirmed}
          />
        </form>
      )}
    </Modal>
  );
}
