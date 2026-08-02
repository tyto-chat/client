import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AdminUserDetail } from "@/api/adminUsers";
import { AdminUserDetailDrawer } from "@/components/admin/AdminUserDetailDrawer";

const userDetailMock = vi.fn();
const apiKeysMock = vi.fn();

vi.mock("@/queries/adminUserQueries", () => ({
  useAdminUserDetail: () => userDetailMock(),
  useAdminUserApiKeys: () => apiKeysMock(),
  usePatchAdminUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAdminUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDisableAdminUserTwoFactor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeAdminUserApiKey: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useIssueAdminUserApiKey: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock("@/components/IssueApiKeyDialog", () => ({
  IssueApiKeyDialog: () => null,
}));

const baseUser: AdminUserDetail = {
  id: 1,
  email: "bot@example.com",
  displayName: "Test Bot",
  isAdmin: true,
  isBot: true,
  isPendingDeletion: false,
  createdAt: "2026-01-01T00:00:00Z",
  apiKeyCount: 0,
  pushSubscriptionCount: 0,
  roles: [],
  twoFactorEnabled: false,
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  userDetailMock.mockClear();
  apiKeysMock.mockClear();
  apiKeysMock.mockReturnValue({ data: { rows: [] } });
});

describe("AdminUserDetailDrawer — Issue API key button visibility", () => {
  it("shows the Issue API key button for bot users", () => {
    userDetailMock.mockReturnValue({ data: { ...baseUser, isBot: true }, isLoading: false });

    render(<AdminUserDetailDrawer userId={1} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByRole("button", { name: /issue api key/i })).toBeInTheDocument();
  });

  it("hides the Issue API key button for non-bot users", () => {
    userDetailMock.mockReturnValue({ data: { ...baseUser, isBot: false }, isLoading: false });

    render(<AdminUserDetailDrawer userId={1} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByRole("button", { name: /issue api key/i })).not.toBeInTheDocument();
  });
});
