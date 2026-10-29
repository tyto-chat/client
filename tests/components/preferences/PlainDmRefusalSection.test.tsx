import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { setServerInfo } from "@/api/serverInfo";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { PlainDmRefusalSection } from "@/components/preferences/PlainDmRefusalSection";
import type { EncryptedDmsMode, ServerInfo } from "@/types/api";
import { E2eeProvider } from "@/e2ee/E2eeContext";
import { LocalSecurityState } from "@/e2ee/localSecurityState";
import { setActiveSecurity } from "@/e2ee/admission";
import { PlainDmRefusalMirror } from "@/components/dm/PlainDmRefusalMirror";
import { memoryKeyStoreFactory } from "../../mocks/memoryKeyStore";

const scope = { serverOrigin: BASE, serverUserId: 1, profileId: "p" };

function securedWrapper(security: LocalSecurityState) {
  return function SecuredWrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return (
      <QueryClientProvider client={queryClient}>
        <E2eeProvider security={security} capable>
          {children}
        </E2eeProvider>
      </QueryClientProvider>
    );
  };
}

let patches: Record<string, unknown>[];

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function serve(mode: EncryptedDmsMode | undefined, refusePlainDms: boolean | null) {
  setServerInfo({ encryptedDmsMode: mode } as ServerInfo);
  server.use(
    http.get(`${BASE}/api/v1/me/preferences`, () =>
      HttpResponse.json({ refusePlainDms, updatedAt: "2026-10-28T00:00:00Z" }),
    ),
    http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
      const patch = (await request.json()) as Record<string, unknown>;
      patches.push(patch);
      return HttpResponse.json({ refusePlainDms, updatedAt: "2026-10-28T00:00:00Z", ...patch });
    }),
  );
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  patches = [];
});

afterEach(() => setActiveSecurity(null));

describe("PlainDmRefusalSection", () => {
  it("writes the refusal locally before telling the server", async () => {
    serve("enabled", null);
    const security = await LocalSecurityState.open(memoryKeyStoreFactory()(), scope);
    const user = userEvent.setup();
    render(<PlainDmRefusalSection />, { wrapper: securedWrapper(security) });

    await user.click(await screen.findByTestId("pref-refuse-plain-dms"));
    await user.click(await screen.findByTestId("confirm-dialog-confirm"));

    await waitFor(() => expect(patches).toEqual([{ refusePlainDms: true }]));
    expect(security.snapshot().refusal.on).toBe(true);
  });

  it("server_cannot_clear_local_refusal", async () => {
    serve("enabled", false);
    const security = await LocalSecurityState.open(memoryKeyStoreFactory()(), scope);
    await security.turnRefusalOn([]);
    render(
      <>
        <PlainDmRefusalSection />
        <PlainDmRefusalMirror />
      </>,
      { wrapper: securedWrapper(security) },
    );

    expect(await screen.findByRole("switch", { checked: true })).toBeInTheDocument();
    await waitFor(() => expect(patches).toEqual([{ refusePlainDms: true }]));
    expect(security.snapshot().refusal.on).toBe(true);
  });

  it("only the user turns the local refusal off", async () => {
    serve("enabled", true);
    const security = await LocalSecurityState.open(memoryKeyStoreFactory()(), scope);
    await security.turnRefusalOn([]);
    const user = userEvent.setup();
    render(<PlainDmRefusalSection />, { wrapper: securedWrapper(security) });

    await user.click(await screen.findByRole("switch", { checked: true }));

    await waitFor(() => expect(patches).toEqual([{ refusePlainDms: false }]));
    expect(security.snapshot().refusal.on).toBe(false);
  });

  it("settings_row_confirms_consequence_before_enabling", async () => {
    serve("enabled", null);
    const user = userEvent.setup();
    render(<PlainDmRefusalSection />, { wrapper });
    const toggle = await screen.findByTestId("pref-refuse-plain-dms");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);
    expect(
      await screen.findByText(/existing unencrypted conversations become read-only/i),
    ).toBeInTheDocument();
    expect(patches).toEqual([]);
    await user.click(screen.getByTestId("confirm-dialog-confirm"));

    await screen.findByRole("switch", { checked: true });
    expect(patches).toEqual([{ refusePlainDms: true }]);
  });

  it("leaves the preference off when the confirmation is cancelled", async () => {
    serve("enabled", null);
    const user = userEvent.setup();
    render(<PlainDmRefusalSection />, { wrapper });

    await user.click(await screen.findByTestId("pref-refuse-plain-dms"));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(screen.getByTestId("pref-refuse-plain-dms")).toHaveAttribute("aria-checked", "false");
    expect(patches).toEqual([]);
  });

  it("turns the preference off without asking", async () => {
    serve("enabled", true);
    const user = userEvent.setup();
    render(<PlainDmRefusalSection />, { wrapper });

    await user.click(await screen.findByRole("switch", { checked: true }));

    await screen.findByRole("switch", { checked: false });
    expect(patches).toEqual([{ refusePlainDms: false }]);
  });

  it("locks the switch until the previous save has finished", async () => {
    serve("enabled", true);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
        const patch = (await request.json()) as Record<string, unknown>;
        patches.push(patch);
        await held;
        return HttpResponse.json({ updatedAt: "2026-10-28T00:00:00Z", ...patch });
      }),
    );
    const user = userEvent.setup();
    render(<PlainDmRefusalSection />, { wrapper });
    const toggle = await screen.findByRole("switch", { checked: true });

    await user.click(toggle);

    await vi.waitFor(() => expect(patches).toEqual([{ refusePlainDms: false }]));
    expect(toggle).toBeDisabled();
    release();
    await vi.waitFor(() => expect(toggle).toBeEnabled());
  });

  it("shows the server's value and an error after a failed save", async () => {
    serve("enabled", true);
    let serverValue = true;
    server.use(
      http.get(`${BASE}/api/v1/me/preferences`, () =>
        HttpResponse.json({ refusePlainDms: serverValue, updatedAt: "2026-10-28T00:00:00Z" }),
      ),
      http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
        patches.push((await request.json()) as Record<string, unknown>);
        serverValue = false;
        return HttpResponse.json({ error: "boom" }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    render(<PlainDmRefusalSection />, { wrapper });

    await user.click(await screen.findByRole("switch", { checked: true }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save this setting/i);
    await screen.findByRole("switch", { checked: false });
    expect(patches).toEqual([{ refusePlainDms: false }]);
  });

  it("stays locked until the stored value can be checked again", async () => {
    serve("enabled", true);
    let reads = 0;
    server.use(
      http.get(`${BASE}/api/v1/me/preferences`, () => {
        reads += 1;
        if (reads === 2) return HttpResponse.json({ error: "down" }, { status: 503 });
        return HttpResponse.json({
          refusePlainDms: reads === 1,
          updatedAt: "2026-10-28T00:00:00Z",
        });
      }),
      http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
        patches.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ error: "boom" }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    render(<PlainDmRefusalSection />, { wrapper });
    const toggle = await screen.findByRole("switch", { checked: true });

    await user.click(toggle);

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(screen.getByTestId("pref-refuse-plain-dms")).toBeDisabled();
    await user.click(retry);

    await vi.waitFor(() => expect(screen.getByTestId("pref-refuse-plain-dms")).toBeEnabled());
    expect(screen.getByTestId("pref-refuse-plain-dms")).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("settings_row_off_only_with_reason_when_mode_disabled", async () => {
    serve("disabled", null);
    const { unmount } = render(<PlainDmRefusalSection />, { wrapper });

    expect(await screen.findByTestId("pref-refuse-plain-dms")).toBeDisabled();
    expect(screen.getByText(/turned off encrypted direct messages/i)).toBeInTheDocument();
    unmount();

    serve("disabled", true);
    const user = userEvent.setup();
    render(<PlainDmRefusalSection />, { wrapper });
    const toggle = await screen.findByRole("switch", { checked: true });
    expect(toggle).toBeEnabled();
    await user.click(toggle);

    await screen.findByRole("switch", { checked: false });
    expect(patches).toEqual([{ refusePlainDms: false }]);
  });

  it("shows the preference as always on when the server requires encryption", async () => {
    serve("required", null);
    render(<PlainDmRefusalSection />, { wrapper });

    const toggle = await screen.findByTestId("pref-refuse-plain-dms");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/requires all direct messages to be encrypted/i)).toBeInTheDocument();
  });

  it("renders nothing when the server does not report an encryption mode", () => {
    serve(undefined, null);
    const { container } = render(<PlainDmRefusalSection />, { wrapper });

    expect(container).toBeEmptyDOMElement();
  });
});
