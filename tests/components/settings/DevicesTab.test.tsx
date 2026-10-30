import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { E2eeContext, type E2eeContextValue } from "@/e2ee/e2eeContextValue";
import type { E2eeIdentity } from "@/e2ee/conversationSession";
import { DevicesTab } from "@/components/settings/DevicesTab";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key} ${JSON.stringify(values)}`,
    i18n: { language: "en" },
  }),
}));
const removeDevice = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const leaveDevice = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/e2ee/removeDevice", () => ({
  removeDevice,
  RemovalIncompleteError: class extends Error {},
}));
vi.mock("@/e2ee/leaveDevice", () => ({ leaveDevice }));
const confirm = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm, confirmDialog: null }) }));

const devices = [
  {
    id: "laptop-id",
    name: "Work laptop",
    generation: 1,
    publicKey: "",
    credential: "",
    server: BASE,
    createdAt: "2026-09-01T08:00:00+00:00",
    lastSeenAt: "2026-10-29T18:30:00+00:00",
    lastResortFingerprint: null,
  },
  {
    id: "phone-id",
    name: "Old phone",
    generation: 1,
    publicKey: "",
    credential: "",
    server: BASE,
    createdAt: "2026-07-14T08:00:00+00:00",
    lastSeenAt: "2026-08-02T09:00:00+00:00",
    lastResortFingerprint: null,
  },
];

function renderTab(identity: Partial<E2eeIdentity> | null) {
  const setIdentity = vi.fn();
  const value = {
    identity: identity as E2eeIdentity | null,
    availability: identity === null ? "not_restored" : "ready",
    setIdentity,
    security: null,
    securitySnapshot: null,
    setSecurity: vi.fn(),
  } satisfies E2eeContextValue;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <E2eeContext.Provider value={value}>{children}</E2eeContext.Provider>
    </QueryClientProvider>
  );
  render(<DevicesTab />, { wrapper });
  return { setIdentity };
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  removeDevice.mockClear();
  leaveDevice.mockClear();
  confirm.mockClear();
  server.use(http.get(`${BASE}/api/v1/e2ee/devices`, () => HttpResponse.json({ items: devices })));
});

describe("DevicesTab", () => {
  it("device_list_shows_name_added_lastseen", async () => {
    renderTab(null);

    const laptop = await screen.findByTestId("e2ee-device-laptop-id");
    expect(laptop).toHaveTextContent("Work laptop");
    expect(laptop).toHaveTextContent("2026");
    expect(laptop).toHaveTextContent(/devices_added .*2026/);
    expect(laptop).toHaveTextContent(/devices_last_seen .*2026/);
    expect(screen.getByTestId("e2ee-device-phone-id")).toHaveTextContent("Old phone");
    expect(screen.queryByRole("button", { name: /devices_remove/ })).toBeNull();
    expect(screen.getByText("devices_manage_needs_setup")).toBeInTheDocument();
  });

  it("removes another device after confirmation", async () => {
    const identity = { deviceId: "laptop-id" };
    renderTab(identity);

    const phone = await screen.findByTestId("e2ee-device-phone-id");
    expect(screen.getByTestId("e2ee-device-laptop-id")).toHaveTextContent("devices_this_device");
    await userEvent.click(phone.querySelector("button") as HTMLButtonElement);

    await waitFor(() => expect(removeDevice).toHaveBeenCalledWith(identity, "phone-id"));
    expect(confirm).toHaveBeenCalled();
  });

  it("removing this device leaves and forgets the identity", async () => {
    const identity = { deviceId: "laptop-id" };
    const { setIdentity } = renderTab(identity);

    const laptop = await screen.findByTestId("e2ee-device-laptop-id");
    await userEvent.click(laptop.querySelector("button") as HTMLButtonElement);

    await waitFor(() => expect(leaveDevice).toHaveBeenCalledWith(identity));
    expect(setIdentity).toHaveBeenCalledWith(null);
    expect(removeDevice).not.toHaveBeenCalled();
  });

  it("does nothing when the confirmation is declined", async () => {
    confirm.mockResolvedValueOnce(false);
    renderTab({ deviceId: "laptop-id" });

    const phone = await screen.findByTestId("e2ee-device-phone-id");
    await userEvent.click(phone.querySelector("button") as HTMLButtonElement);

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(removeDevice).not.toHaveBeenCalled();
  });
});
