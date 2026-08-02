import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AdminUserDetail } from "@/api/adminUsers";
import { AdminUserDetailDrawer } from "@/components/admin/AdminUserDetailDrawer";

const userDetailMock = vi.fn();
const apiKeysMock = vi.fn();
const disable2faMutateAsync = vi.fn();
const notifyMock = vi.fn();

vi.mock("@/queries/adminUserQueries", () => ({
  useAdminUserDetail: () => userDetailMock(),
  useAdminUserApiKeys: () => apiKeysMock(),
  usePatchAdminUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAdminUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeAdminUserApiKey: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useIssueAdminUserApiKey: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDisableAdminUserTwoFactor: () => ({
    mutateAsync: disable2faMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: notifyMock }),
}));

vi.mock("@/components/IssueApiKeyModal", () => ({
  IssueApiKeyModal: () => null,
}));

const baseUser: AdminUserDetail = {
  id: 1,
  email: "person@example.com",
  displayName: "Test Person",
  isAdmin: false,
  isBot: false,
  isPendingDeletion: false,
  createdAt: "2026-01-01T00:00:00Z",
  apiKeyCount: 0,
  pushSubscriptionCount: 0,
  roles: [],
  twoFactorEnabled: true,
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
  disable2faMutateAsync.mockClear();
  notifyMock.mockClear();
  apiKeysMock.mockReturnValue({ data: { rows: [] } });
});

describe("AdminUserDetailDrawer — force-disable 2FA", () => {
  it("shows the section when the user has 2FA enabled", () => {
    userDetailMock.mockReturnValue({ data: baseUser, isLoading: false });

    render(<AdminUserDetailDrawer userId={1} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByTestId("admin-disable-2fa")).toBeInTheDocument();
  });

  it("hides the section when the user does not have 2FA enabled", () => {
    userDetailMock.mockReturnValue({
      data: { ...baseUser, twoFactorEnabled: false },
      isLoading: false,
    });

    render(<AdminUserDetailDrawer userId={1} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByTestId("admin-disable-2fa")).not.toBeInTheDocument();
  });

  it("hides the section for bot users even with 2FA enabled", () => {
    userDetailMock.mockReturnValue({
      data: { ...baseUser, isBot: true, twoFactorEnabled: true },
      isLoading: false,
    });

    render(<AdminUserDetailDrawer userId={1} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByTestId("admin-disable-2fa")).not.toBeInTheDocument();
  });

  it("confirms and disables 2FA, notifying on success", async () => {
    disable2faMutateAsync.mockResolvedValue({ ...baseUser, twoFactorEnabled: false });
    userDetailMock.mockReturnValue({ data: baseUser, isLoading: false });

    render(<AdminUserDetailDrawer userId={1} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    await userEvent.click(screen.getByTestId("admin-disable-2fa"));
    await userEvent.click(await screen.findByTestId("confirm-dialog-confirm"));

    expect(disable2faMutateAsync).toHaveBeenCalledWith(1);
    expect(notifyMock).toHaveBeenCalledWith("Two-factor authentication disabled.", "success");
  });

  it("notifies on failure when disabling 2FA rejects", async () => {
    disable2faMutateAsync.mockRejectedValue(new Error("boom"));
    userDetailMock.mockReturnValue({ data: baseUser, isLoading: false });

    render(<AdminUserDetailDrawer userId={1} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    await userEvent.click(screen.getByTestId("admin-disable-2fa"));
    await userEvent.click(await screen.findByTestId("confirm-dialog-confirm"));

    expect(notifyMock).toHaveBeenCalledWith(
      "Could not disable two-factor authentication.",
      "error",
    );
  });
});
