import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { useState, type ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { SecurityTab } from "@/components/SecurityTab";

function TestWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
});

describe("SecurityTab", () => {
  it("shows enable action when 2FA is off", async () => {
    server.use(
      http.get(`${BASE}/api/v1/users/me/2fa`, () =>
        HttpResponse.json({ enabled: false, enabledAt: null, recoveryCodesRemaining: 0 }),
      ),
    );
    render(<SecurityTab />, { wrapper: TestWrapper });
    expect(await screen.findByTestId("two-factor-enable")).toBeInTheDocument();
  });

  it("shows status and manage actions when 2FA is on", async () => {
    server.use(
      http.get(`${BASE}/api/v1/users/me/2fa`, () =>
        HttpResponse.json({
          enabled: true,
          enabledAt: "2026-07-20T00:00:00+00:00",
          recoveryCodesRemaining: 8,
        }),
      ),
    );
    render(<SecurityTab />, { wrapper: TestWrapper });
    expect(await screen.findByTestId("two-factor-disable")).toBeInTheDocument();
    expect(screen.getByTestId("two-factor-regenerate")).toBeInTheDocument();
  });
});
