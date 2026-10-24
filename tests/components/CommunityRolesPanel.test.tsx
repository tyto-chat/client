import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommunityRolesPanel } from "@/components/CommunityRolesPanel";

const authState = vi.hoisted(() => ({ roles: ["ROLE_USER"] as string[] }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, roles: authState.roles } }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock("@/queries/communityQueries", () => ({
  useCommunityMembers: () => ({ data: [], isLoading: false }),
  useUpdateCommunityMemberRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddCommunityMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/queries/conversationQueries", () => ({
  useInvitableUsers: () => ({ data: undefined }),
}));

describe("CommunityRolesPanel add-member section", () => {
  beforeEach(() => {
    authState.roles = ["ROLE_USER"];
  });

  it("is hidden from community admins who are not server admins", () => {
    render(<CommunityRolesPanel communityId="c1" currentUserId={1} />);
    expect(screen.queryByText("Add member")).toBeNull();
  });

  it("is shown to server admins", () => {
    authState.roles = ["ROLE_USER", "ROLE_ADMIN"];
    render(<CommunityRolesPanel communityId="c1" currentUserId={1} />);
    expect(screen.getByText("Add member")).toBeTruthy();
  });
});
