import { useTranslation } from "react-i18next";
import { ReorderModal } from "@/components/ReorderModal";
import { useReorderChannels } from "@/queries/channelQueries";
import type { Channel } from "@/types/api";

export function ReorderChannelsModal({
  communityId,
  sectionId,
  sectionName,
  channels,
  onClose,
}: {
  communityId: string;
  sectionId: number;
  sectionName: string;
  channels: Channel[];
  onClose: () => void;
}) {
  const { t } = useTranslation("community");
  const reorder = useReorderChannels(communityId, sectionId);

  return (
    <ReorderModal
      title={t("reorder_channels_title", { section: sectionName })}
      testId="reorder-channels-modal"
      items={channels}
      isPending={reorder.isPending}
      onReorder={(ids) => reorder.mutateAsync(ids)}
      onClose={onClose}
    />
  );
}
