import { useTranslation } from "react-i18next";
import { ReorderModal } from "@/components/ReorderModal";
import { useReorderSections } from "@/queries/channelQueries";
import type { ChannelSection } from "@/types/api";

export function ReorderSectionsModal({
  communityId,
  sections,
  onClose,
}: {
  communityId: string;
  sections: ChannelSection[];
  onClose: () => void;
}) {
  const { t } = useTranslation("community");
  const reorder = useReorderSections(communityId);

  return (
    <ReorderModal
      title={t("reorder_sections_title")}
      testId="reorder-sections-modal"
      items={sections}
      isPending={reorder.isPending}
      onReorder={(ids) => reorder.mutateAsync(ids)}
      onClose={onClose}
    />
  );
}
