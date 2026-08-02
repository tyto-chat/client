import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { makeAdminServerConfig } from "../fixtures/adminServerConfig";
import type { AdminServerConfig, AdminServerConfigPatch } from "@/api/adminServerConfig";
import { ModerationPanel } from "@/components/admin/settings/ModerationPanel";

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
  return render(<ModerationPanel config={config} />, { wrapper: makeWrapper() });
}

beforeEach(() => {
  patchMock.mockClear();
});

describe("ModerationPanel", () => {
  it("renders with Save button disabled when nothing is changed", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("enables Save button after changing autoTimeoutHits", async () => {
    renderPanel();
    const input = screen.getByDisplayValue("5");
    await userEvent.clear(input);
    await userEvent.type(input, "10");
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
  });

  it("enables Save button after toggling autoTimeoutEnabled", async () => {
    renderPanel();
    const toggle = screen.getByRole("switch", { name: /enable auto-timeout/i });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
  });

  it("patches only the changed field on save", async () => {
    renderPanel();
    const hitsInput = screen.getByDisplayValue("5");
    await userEvent.clear(hitsInput);
    await userEvent.type(hitsInput, "20");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const body = patchMock.mock.calls[0]![0];
    expect(body.autoTimeoutHits).toBe(20);
    // Unchanged fields must NOT be in the patch
    expect("autoTimeoutEnabled" in body).toBe(false);
    expect("autoTimeoutWindowSeconds" in body).toBe(false);
  });

  it("calls onDirtyChange with true when a field is edited", async () => {
    const onDirtyChange = vi.fn();
    render(<ModerationPanel config={baseConfig} onDirtyChange={onDirtyChange} />, {
      wrapper: makeWrapper(),
    });
    const hitsInput = screen.getByDisplayValue("5");
    await userEvent.clear(hitsInput);
    await userEvent.type(hitsInput, "3");
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });
});
