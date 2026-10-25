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

  it("patches the realtime token lifetime", async () => {
    renderPanel();
    const input = screen.getByRole("spinbutton", { name: /realtime token lifetime/i });
    await userEvent.clear(input);
    await userEvent.type(input, "45");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const body = patchMock.mock.calls[0]![0];
    expect(body.realtimeTokenTtlMinutes).toBe(45);
    expect("resetPasswordCodeExpiryMinutes" in body).toBe(false);
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

  describe("HTTP cache controls", () => {
    const pageTtl = () => screen.getByRole("spinbutton", { name: /page cache ttl/i });

    it("keeps the cache fields locked until the user confirms they know what they are doing", async () => {
      renderPanel();
      expect(pageTtl()).toBeDisabled();
      expect(screen.getByRole("button", { name: "Disable HTTP cache" })).toBeDisabled();

      await userEvent.click(screen.getByRole("checkbox", { name: "I know what I am doing" }));

      expect(pageTtl()).toBeEnabled();
      expect(screen.getByRole("button", { name: "Disable HTTP cache" })).toBeEnabled();
    });

    it("asks for confirmation before saving a cache change and patches nothing when cancelled", async () => {
      renderPanel();
      await userEvent.click(screen.getByRole("checkbox", { name: "I know what I am doing" }));
      await userEvent.clear(pageTtl());
      await userEvent.type(pageTtl(), "120");
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText("Change HTTP cache settings?")).toBeInTheDocument();
      expect(patchMock).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(patchMock).not.toHaveBeenCalled();
    });

    it("patches only the cache field after the confirmation is accepted", async () => {
      renderPanel();
      await userEvent.click(screen.getByRole("checkbox", { name: "I know what I am doing" }));
      await userEvent.clear(pageTtl());
      await userEvent.type(pageTtl(), "120");
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await userEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

      expect(patchMock).toHaveBeenCalledTimes(1);
      expect(patchMock.mock.calls[0]![0]).toEqual({ httpCachePageTtlSeconds: 120 });
    });

    it("disables the whole cache by zeroing all three TTLs", async () => {
      renderPanel();
      await userEvent.click(screen.getByRole("checkbox", { name: "I know what I am doing" }));
      await userEvent.click(screen.getByRole("button", { name: "Disable HTTP cache" }));
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await userEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

      expect(patchMock.mock.calls[0]![0]).toEqual({
        httpCachePageTtlSeconds: 0,
        httpCachePresenceTtlSeconds: 0,
        httpCacheContextTtlSeconds: 0,
      });
    });

    it("saves non-cache changes without any confirmation", async () => {
      renderPanel();
      const expiryInput = screen.getByDisplayValue("30");
      await userEvent.clear(expiryInput);
      await userEvent.type(expiryInput, "60");
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(screen.queryByText("Change HTTP cache settings?")).not.toBeInTheDocument();
      expect(patchMock).toHaveBeenCalledTimes(1);
    });
  });
});
