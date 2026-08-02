import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { makeAdminServerConfig } from "../fixtures/adminServerConfig";
import type { AdminServerConfig, AdminServerConfigPatch } from "@/api/adminServerConfig";
import { EmailPanel } from "@/components/admin/settings/EmailPanel";

const patchMock = vi.fn<(body: AdminServerConfigPatch) => Promise<unknown>>(() =>
  Promise.resolve({}),
);

vi.mock("@/queries/adminServerConfigQueries", () => ({
  usePatchAdminServerConfig: () => ({ mutateAsync: patchMock, isPending: false }),
  useSendAdminTestEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

// useUnsavedGuard pulls in useBlocker, which requires a RouterProvider.
// Stub it — the dirty-guard wiring is covered by AdminSettingsTabs tests.
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
  return render(<EmailPanel config={config} />, { wrapper: makeWrapper() });
}

beforeEach(() => {
  patchMock.mockClear();
});

describe("EmailPanel", () => {
  it("shows the 'password is set' placeholder when smtpPasswordSet is true", () => {
    renderPanel({ ...baseConfig, smtpPasswordSet: true });
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.placeholder).toBe("Password is set — leave blank to keep");
    expect(input.value).toBe("");
  });

  it("shows the 'not configured' placeholder when smtpPasswordSet is false", () => {
    renderPanel({ ...baseConfig, smtpPasswordSet: false });
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.placeholder).toBe("Not configured");
  });

  it("omits smtpPassword from the patch when the password field is left blank", async () => {
    renderPanel();

    await userEvent.type(screen.getByLabelText("Host"), "smtp.example.com");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const body = patchMock.mock.calls[0]![0];
    expect(body.smtpHost).toBe("smtp.example.com");
    expect("smtpPassword" in body).toBe(false);
  });

  it("includes smtpPassword in the patch when a password is typed", async () => {
    renderPanel();

    await userEvent.type(screen.getByLabelText("Host"), "smtp.example.com");
    await userEvent.type(screen.getByLabelText("Password"), "s3cret");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const body = patchMock.mock.calls[0]![0];
    expect(body.smtpHost).toBe("smtp.example.com");
    expect(body.smtpPassword).toBe("s3cret");
  });
});
