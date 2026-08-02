import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { StrictMode, useState, type ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { TwoFactorSetupModal } from "@/components/TwoFactorSetupModal";

vi.mock("qrcode", () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined) },
}));

function TestWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const SETUP_RESPONSE = {
  secret: "JBSWY3DPEHPK3PXP",
  otpauthUri: "otpauth://totp/tyto.chat:me@example.com?secret=JBSWY3DPEHPK3PXP&issuer=tyto.chat",
};

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  server.use(
    http.post(`${BASE}/api/v1/users/me/2fa/setup`, () => HttpResponse.json(SETUP_RESPONSE)),
  );
});

describe("TwoFactorSetupModal", () => {
  it("renders the QR step once setup resolves", async () => {
    render(<TwoFactorSetupModal onClose={vi.fn()} />, { wrapper: TestWrapper });

    expect(await screen.findByText(SETUP_RESPONSE.secret)).toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeInTheDocument();
    expect(screen.getByTestId("two-factor-setup-next")).not.toBeDisabled();
  });

  it("renders the QR step under StrictMode with a single setup request", async () => {
    let setupCalls = 0;
    server.use(
      http.post(`${BASE}/api/v1/users/me/2fa/setup`, () => {
        setupCalls += 1;
        return HttpResponse.json(SETUP_RESPONSE);
      }),
    );

    render(
      <StrictMode>
        <TestWrapper>
          <TwoFactorSetupModal onClose={vi.fn()} />
        </TestWrapper>
      </StrictMode>,
    );

    expect(await screen.findByText(SETUP_RESPONSE.secret)).toBeInTheDocument();
    expect(screen.getByTestId("two-factor-setup-next")).not.toBeDisabled();
    expect(setupCalls).toBe(1);
  });

  it("shows an error when setup fails instead of a blank QR step", async () => {
    server.use(
      http.post(`${BASE}/api/v1/users/me/2fa/setup`, () =>
        HttpResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 }),
      ),
    );

    render(<TwoFactorSetupModal onClose={vi.fn()} />, { wrapper: TestWrapper });

    expect(
      await screen.findByText("Too many requests. Please try again later."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("two-factor-setup-next")).toBeDisabled();
  });

  it("advances to the verify step and shows an error on a wrong code", async () => {
    server.use(
      http.post(`${BASE}/api/v1/users/me/2fa/confirm`, () =>
        HttpResponse.json({ error: "Invalid code." }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    render(<TwoFactorSetupModal onClose={vi.fn()} />, { wrapper: TestWrapper });

    await screen.findByText(SETUP_RESPONSE.secret);
    await user.click(screen.getByTestId("two-factor-setup-next"));

    const codeInput = screen.getByTestId("two-factor-setup-code");
    await user.type(codeInput, "000000");
    await user.click(screen.getByRole("button", { name: /turn on/i }));

    expect(await screen.findByText("Invalid code.")).toBeInTheDocument();
    expect(screen.getByTestId("two-factor-setup-code")).toBeInTheDocument();
  });

  it("reaches the recovery codes step on success and blocks dismissal until saved", async () => {
    const recoveryCodes = ["aaaa-1111", "bbbb-2222", "cccc-3333"];
    server.use(
      http.post(`${BASE}/api/v1/users/me/2fa/confirm`, () => HttpResponse.json({ recoveryCodes })),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TwoFactorSetupModal onClose={onClose} />, { wrapper: TestWrapper });

    await screen.findByText(SETUP_RESPONSE.secret);
    await user.click(screen.getByTestId("two-factor-setup-next"));
    await user.type(screen.getByTestId("two-factor-setup-code"), "123456");
    await user.click(screen.getByRole("button", { name: /turn on/i }));

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
