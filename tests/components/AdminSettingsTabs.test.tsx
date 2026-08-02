import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { makeAdminServerConfig } from "../fixtures/adminServerConfig";
import type { AdminServerConfig } from "@/api/adminServerConfig";
import { AdminSettingsTabs } from "@/components/admin/settings/AdminSettingsTabs";

const mockConfig: AdminServerConfig = makeAdminServerConfig();

vi.mock("@/queries/adminServerConfigQueries", () => ({
  useAdminServerConfig: () => ({ data: mockConfig, isLoading: false }),
  usePatchAdminServerConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendAdminTestEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

// Stub panels so only the shell behaviour is under test (avoids pulling in
// heavy deps such as usePanelForm → useUnsavedGuard → useBlocker which
// requires a RouterProvider).
vi.mock("@/components/admin/settings/GeneralPanel", () => ({
  GeneralPanel: ({
    config,
    onDirtyChange,
  }: {
    config: AdminServerConfig;
    onDirtyChange?: (d: boolean) => void;
  }) => {
    React.useEffect(() => onDirtyChange?.(true), [onDirtyChange]);
    return (
      <div data-testid="general-panel">
        <label>
          Server name
          <input type="text" defaultValue={config.serverName} />
        </label>
      </div>
    );
  },
}));

vi.mock("@/components/admin/settings/AttachmentsPanel", () => ({
  AttachmentsPanel: ({ config }: { config: AdminServerConfig }) => (
    <div data-testid="attachments-panel">
      <label>
        Max attachment size (MB)
        <input type="number" defaultValue={config.maxAttachmentSizeMb} />
      </label>
    </div>
  ),
}));

vi.mock("@/components/admin/settings/RateLimitsPanel", () => ({
  RateLimitsPanel: () => <div data-testid="rate-panel">Rate limits panel</div>,
}));

vi.mock("@/components/admin/settings/EmailPanel", () => ({
  EmailPanel: () => <div data-testid="email-panel">Email panel</div>,
}));

vi.mock("@/components/admin/settings/ModerationPanel", () => ({
  ModerationPanel: () => <div data-testid="moderation-panel">Moderation panel</div>,
}));

vi.mock("@/components/admin/settings/AdvancedPanel", () => ({
  AdvancedPanel: () => <div data-testid="advanced-panel">Advanced panel</div>,
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("AdminSettingsTabs", () => {
  it("renders all six tab labels", () => {
    render(<AdminSettingsTabs />, { wrapper: makeWrapper() });

    expect(screen.getByRole("button", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uploads" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rate limits" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Moderation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advanced" })).toBeInTheDocument();
  });

  it("shows General panel by default", () => {
    render(<AdminSettingsTabs />, { wrapper: makeWrapper() });

    expect(screen.getByTestId("general-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("attachments-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rate-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("email-panel")).not.toBeInTheDocument();
  });

  it("switches to Uploads panel and unmounts General panel", async () => {
    // GeneralPanel stub reports dirty on mount, so a discard-confirm dialog
    // appears; accept it to allow switching.
    render(<AdminSettingsTabs />, { wrapper: makeWrapper() });

    expect(screen.getByTestId("general-panel")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Uploads" }));
    await userEvent.click(await screen.findByTestId("confirm-dialog-confirm"));

    expect(screen.getByTestId("attachments-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("general-panel")).not.toBeInTheDocument();
  });

  it("confirms before switching away from a dirty tab and stays when cancelled", async () => {
    render(<AdminSettingsTabs />, { wrapper: makeWrapper() });

    await userEvent.click(screen.getByRole("button", { name: "Uploads" }));
    // Discard-confirm dialog appears; dismiss it (Escape) — must NOT switch.
    await screen.findByTestId("confirm-dialog-confirm");
    await userEvent.keyboard("{Escape}");

    expect(screen.getByTestId("general-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("attachments-panel")).not.toBeInTheDocument();
  });

  it("switches when the confirm is accepted", async () => {
    render(<AdminSettingsTabs />, { wrapper: makeWrapper() });

    await userEvent.click(screen.getByRole("button", { name: "Uploads" }));
    await userEvent.click(await screen.findByTestId("confirm-dialog-confirm"));

    expect(screen.getByTestId("attachments-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("general-panel")).not.toBeInTheDocument();
  });

  it("navigates to Moderation panel", async () => {
    render(<AdminSettingsTabs />, { wrapper: makeWrapper() });

    await userEvent.click(screen.getByRole("button", { name: "Moderation" }));
    await userEvent.click(await screen.findByTestId("confirm-dialog-confirm"));

    expect(screen.getByTestId("moderation-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("general-panel")).not.toBeInTheDocument();
  });

  it("navigates to Advanced panel", async () => {
    render(<AdminSettingsTabs />, { wrapper: makeWrapper() });

    await userEvent.click(screen.getByRole("button", { name: "Advanced" }));
    await userEvent.click(await screen.findByTestId("confirm-dialog-confirm"));

    expect(screen.getByTestId("advanced-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("general-panel")).not.toBeInTheDocument();
  });
});
