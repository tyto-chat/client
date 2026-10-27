import { useCallback, useState, type ReactNode } from "react";
import { UserModerationModal } from "@/components/UserModerationModal";

export function useConversationProfileCard(): {
  openProfile: (userId: number) => void;
  profileCard: ReactNode;
} {
  const [userId, setUserId] = useState<number | null>(null);
  const openProfile = useCallback((id: number) => setUserId(id), []);
  const profileCard =
    userId !== null ? (
      <UserModerationModal userId={userId} canModerate={false} onClose={() => setUserId(null)} />
    ) : null;
  return { openProfile, profileCard };
}
