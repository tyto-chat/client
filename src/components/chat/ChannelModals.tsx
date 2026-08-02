import { EditChannelModal } from "@/components/ChannelModal";
import { ManageChannelAccessModal } from "@/components/ManageChannelAccessModal";
import { ChannelMembersModal } from "@/components/ChannelMembersModal";
import type { Channel } from "@/types/api";

export function ChannelModals({
  channel,
  communityId,
  isAdmin,
  canManageChannelMembers,
  userId,
  editChannelOpen,
  manageAccessOpen,
  membersModalOpen,
  onCloseEdit,
  onCloseManageAccess,
  onCloseMembers,
  onLeftCommunity,
}: {
  channel: Channel;
  communityId: string;
  isAdmin: boolean;
  canManageChannelMembers: boolean;
  userId: number | undefined;
  editChannelOpen: boolean;
  manageAccessOpen: boolean;
  membersModalOpen: boolean;
  onCloseEdit: () => void;
  onCloseManageAccess: () => void;
  onCloseMembers: () => void;
  onLeftCommunity: () => void;
}) {
  return (
    <>
      {editChannelOpen && (
        <EditChannelModal channel={channel} communityId={communityId} onClose={onCloseEdit} />
      )}
      {manageAccessOpen && (
        <ManageChannelAccessModal
          channel={channel}
          communityId={communityId}
          isAdmin={isAdmin}
          canManageMembers={canManageChannelMembers}
          onClose={onCloseManageAccess}
        />
      )}
      {membersModalOpen && userId != null && (
        <ChannelMembersModal
          channel={channel}
          communityId={communityId}
          currentUserId={userId}
          isAdmin={isAdmin}
          onClose={onCloseMembers}
          onLeft={onLeftCommunity}
        />
      )}
    </>
  );
}
