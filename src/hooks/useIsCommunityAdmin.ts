import { useAuth } from "@/hooks/useAuth";
import { useCommunityMembership } from "@/queries/membershipQueries";

export function useIsCommunityAdmin(communityId: string): boolean {
  const { user } = useAuth();
  const { data: membership } = useCommunityMembership(communityId);

  if (!user) return false;
  if (user.roles?.includes("ROLE_ADMIN")) return true;

  return membership?.role === "admin";
}
