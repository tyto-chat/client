import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { useState, type ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { NotificationProvider } from "@/context/NotificationContext";
import { TwoFactorPasswordActionModal } from "@/components/TwoFactorPasswordActionModal";

function TestWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>{children}</NotificationProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
});

describe("TwoFactorPasswordActionModal", () => {
  it("disable: success calls onClose", async () => {
    server.use(
      http.post(
        `${BASE}/api/v1/users/me/2fa/disable`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TwoFactorPasswordActionModal action="disable" onClose={onClose} />, {
      wrapper: TestWrapper,
    });

    expect(screen.getByText("Disable two-factor authentication")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Current password"), "correct-horse");
    await user.click(screen.getByTestId("two-factor-action-submit"));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("disable: wrong password shows an error and stays open", async () => {
    server.use(
      http.post(`${BASE}/api/v1/users/me/2fa/disable`, () =>
        HttpResponse.json({ error: "Incorrect password." }, { status: 400 }),
      ),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TwoFactorPasswordActionModal action="disable" onClose={onClose} />, {
      wrapper: TestWrapper,
    });

    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.click(screen.getByTestId("two-factor-action-submit"));

    expect(await screen.findByText("Incorrect password.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("regenerate: success shows the recovery codes and blocks backdrop dismissal", async () => {
    const recoveryCodes = ["aaaa-1111", "bbbb-2222", "cccc-3333"];
    server.use(
      http.post(`${BASE}/api/v1/users/me/2fa/recovery-codes`, () =>
        HttpResponse.json({ recoveryCodes }),
      ),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TwoFactorPasswordActionModal action="regenerate" onClose={onClose} />, {
      wrapper: TestWrapper,
    });

    await user.type(screen.getByLabelText("Current password"), "correct-horse");
    await user.click(screen.getByTestId("two-factor-action-submit"));

    for (const rc of recoveryCodes) {
      expect(await screen.findByText(rc)).toBeInTheDocument();
    }

    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument();
    const backdrop = document.querySelector(".fixed.inset-0");
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop as Element);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("two-factor-codes-saved"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
