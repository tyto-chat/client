import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { makeAdminServerConfig } from "../fixtures/adminServerConfig";
import type { AdminServerConfig, AdminServerConfigPatch } from "@/api/adminServerConfig";
import { AdvancedPanel } from "@/components/admin/settings/AdvancedPanel";

const patchMock = vi.fn<(body: AdminServerConfigPatch) => Promise<unknown>>(() =>
  Promise.resolve({}),
);

vi.mock("@/queries/adminServerConfigQueries", () => ({
  usePatchAdminServerConfig: () => ({ mutateAsync: patchMock, isPending: false }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock("@/hooks/useUnsavedGuard", () => ({
  useUnsavedGuard: () => {},
}));

vi.mock("@/queries/adminUserQueries", () => ({
  useAdminBots: () => ({
    data: {
      rows: [{ id: 5, displayName: "Welcome Bot", isBot: true }],
      total: 1,
      page: 1,
      perPage: 100,
    },
    isLoading: false,
  }),
}));

const baseConfig: AdminServerConfig = makeAdminServerConfig();

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function renderPanel(config: AdminServerConfig = baseConfig) {
  return render(<AdvancedPanel config={config} />, { wrapper: makeWrapper() });
}

beforeEach(() => {
  patchMock.mockClear();
});

describe("AdvancedPanel", () => {
  it("renders with Save button disabled when nothing is changed", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("enables Save button after changing resetPasswordCodeExpiryMinutes", async () => {
    renderPanel();
    const input = screen.getByDisplayValue("30");
    await userEvent.clear(input);
    await userEvent.type(input, "45");
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
  });

  it("enables Save button after toggling validateEmails", async () => {
    renderPanel();
    const toggle = screen.getByRole("switch", { name: /validate email/i });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
  });

  it("patches only the changed field on save", async () => {
    renderPanel();
    const expiryInput = screen.getByDisplayValue("30");
    await userEvent.clear(expiryInput);
    await userEvent.type(expiryInput, "60");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const body = patchMock.mock.calls[0]![0];
    expect(body.resetPasswordCodeExpiryMinutes).toBe(60);
    // Unchanged fields must NOT be in the patch
    expect("emailChallengeExpiryMinutes" in body).toBe(false);
    expect("digestHour" in body).toBe(false);
  });

  it("patches only welcomeBotId when the welcome-bot select is changed", async () => {
    renderPanel();
    const welcomeSelect = screen.getByRole("combobox", { name: /welcome bot/i });
    await userEvent.selectOptions(welcomeSelect, "5");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const body = patchMock.mock.calls[0]![0];
    expect(body.welcomeBotId).toBe(5);
    expect("defaultBotId" in body).toBe(false);
    expect("autoModeratorBotId" in body).toBe(false);
  });

  it("calls onDirtyChange with true when a field is edited", async () => {
    const onDirtyChange = vi.fn();
    render(<AdvancedPanel config={baseConfig} onDirtyChange={onDirtyChange} />, {
      wrapper: makeWrapper(),
    });
    const expiryInput = screen.getByDisplayValue("30");
    await userEvent.clear(expiryInput);
    await userEvent.type(expiryInput, "15");
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });
});
