import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { setServerInfo } from "@/api/serverInfo";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { WelcomeWizard } from "@/components/onboarding/WelcomeWizard";
import type { EncryptedDmsMode, ServerInfo } from "@/types/api";

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({ user: mockUser, refreshUser: async () => undefined }),
}));

let patches: Record<string, unknown>[];
let completed: number;

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function start(mode: EncryptedDmsMode) {
  setServerInfo({ encryptedDmsMode: mode } as ServerInfo);
  const onClose = vi.fn();
  render(<WelcomeWizard onClose={onClose} />, { wrapper });
  return onClose;
}

async function goToLastStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Find your people");
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  patches = [];
  completed = 0;
  server.use(
    http.get(`${BASE}/api/v1/communities`, () => HttpResponse.json([])),
    http.get(`${BASE}/api/v1/me/community-memberships`, () => HttpResponse.json([])),
    http.patch(`${BASE}/api/v1/profiles/1`, () => HttpResponse.json({})),
    http.post(`${BASE}/api/v1/me/onboarding/complete`, () => {
      completed += 1;
      return HttpResponse.json({ onboardedAt: "2026-10-28T00:00:00Z" });
    }),
    http.get(`${BASE}/api/v1/me/preferences`, () =>
      HttpResponse.json({ refusePlainDms: null, updatedAt: "2026-10-28T00:00:00Z" }),
    ),
    http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
      const patch = (await request.json()) as Record<string, unknown>;
      patches.push(patch);
      return HttpResponse.json({ updatedAt: "2026-10-28T00:00:00Z", ...patch });
    }),
  );
});

describe("WelcomeWizard encryption step", () => {
  it("wizard_has_three_steps_when_mode_enabled", async () => {
    const user = userEvent.setup();
    start("enabled");

    expect(screen.getByText("Encryption")).toBeInTheDocument();
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Encrypted direct messages")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-refuse-plain-dms")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("wizard_skips_encryption_step_when_disabled", async () => {
    const user = userEvent.setup();
    const onClose = start("disabled");

    expect(screen.queryByText("Encryption")).not.toBeInTheDocument();
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Done" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(patches).toEqual([]);
  });

  it("wizard_encryption_step_informational_when_required", async () => {
    const user = userEvent.setup();
    start("required");
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(
      await screen.findByText(/requires all direct messages to be encrypted/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("welcome-refuse-plain-dms")).not.toBeInTheDocument();
  });

  it("wizard_step_saves_preference_on_continue", async () => {
    const user = userEvent.setup();
    const onClose = start("enabled");
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    const toggle = await screen.findByTestId("welcome-refuse-plain-dms");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(patches).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Done" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(patches).toEqual([{ refusePlainDms: true }]);
    expect(completed).toBe(1);
  });

  it("saves nothing when the user leaves the switch off", async () => {
    const user = userEvent.setup();
    const onClose = start("enabled");
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByTestId("welcome-refuse-plain-dms");

    await user.click(screen.getByRole("button", { name: "Done" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(patches).toEqual([]);
  });

  it("saves the off choice when a retry follows a half-finished first attempt", async () => {
    let failures = 1;
    server.use(
      http.post(`${BASE}/api/v1/me/onboarding/complete`, () => {
        if (failures > 0) {
          failures -= 1;
          return HttpResponse.json({ error: "boom" }, { status: 500 });
        }
        completed += 1;
        return HttpResponse.json({ onboardedAt: "2026-10-28T00:00:00Z" });
      }),
    );
    const user = userEvent.setup();
    const onClose = start("enabled");
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    const toggle = await screen.findByTestId("welcome-refuse-plain-dms");
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await vi.waitFor(() => expect(patches).toEqual([{ refusePlainDms: true }]));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("button", { name: "Done" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(patches).toEqual([{ refusePlainDms: true }, { refusePlainDms: false }]);
  });

  it("locks the choice while finishing", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(`${BASE}/api/v1/me/onboarding/complete`, async () => {
        await held;
        return HttpResponse.json({ onboardedAt: "2026-10-28T00:00:00Z" });
      }),
    );
    const user = userEvent.setup();
    const onClose = start("enabled");
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    const toggle = await screen.findByTestId("welcome-refuse-plain-dms");

    await user.click(screen.getByRole("button", { name: "Done" }));

    await vi.waitFor(() => expect(toggle).toBeDisabled());
    release();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("does not close from the backdrop while the choice is still saving", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch(`${BASE}/api/v1/me/preferences`, async () => {
        await held;
        return HttpResponse.json({ error: "boom" }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    const onClose = start("enabled");
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByTestId("welcome-refuse-plain-dms"));
    await user.click(screen.getByRole("button", { name: "Done" }));

    fireEvent.mouseDown(screen.getAllByRole("presentation")[0]!);
    release();

    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeEnabled());
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(completed).toBe(0);
  });

  it("keeps the switch locked until the saved choice has loaded", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${BASE}/api/v1/me/preferences`, async () => {
        await held;
        return HttpResponse.json({ refusePlainDms: true, updatedAt: "2026-10-28T00:00:00Z" });
      }),
    );
    const user = userEvent.setup();
    start("enabled");
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    const toggle = await screen.findByTestId("welcome-refuse-plain-dms");
    expect(toggle).toBeDisabled();

    release();

    await vi.waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("saves nothing when the saved choice cannot be loaded", async () => {
    server.use(
      http.get(`${BASE}/api/v1/me/preferences`, () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    const onClose = start("enabled");
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    const toggle = await screen.findByTestId("welcome-refuse-plain-dms");

    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Done" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toggle).toBeDisabled();
    expect(patches).toEqual([]);
  });

  it("sends the final choice again after a save whose reply was lost", async () => {
    let lose = true;
    server.use(
      http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
        const patch = (await request.json()) as Record<string, unknown>;
        patches.push(patch);
        if (lose) {
          lose = false;
          return HttpResponse.json({ error: "boom" }, { status: 500 });
        }
        return HttpResponse.json({ updatedAt: "2026-10-28T00:00:00Z", ...patch });
      }),
    );
    const user = userEvent.setup();
    const onClose = start("enabled");
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    const toggle = await screen.findByTestId("welcome-refuse-plain-dms");
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByText("boom");

    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Done" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(patches).toEqual([{ refusePlainDms: true }, { refusePlainDms: false }]);
  });

  it("saves the shown choice when skipping after a half-finished attempt", async () => {
    let failures = 1;
    server.use(
      http.post(`${BASE}/api/v1/me/onboarding/complete`, () => {
        if (failures > 0) {
          failures -= 1;
          return HttpResponse.json({ error: "boom" }, { status: 500 });
        }
        completed += 1;
        return HttpResponse.json({ onboardedAt: "2026-10-28T00:00:00Z" });
      }),
    );
    const user = userEvent.setup();
    const onClose = start("enabled");
    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    const toggle = await screen.findByTestId("welcome-refuse-plain-dms");
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByText("boom");

    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Skip for now" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(patches).toEqual([{ refusePlainDms: true }, { refusePlainDms: false }]);
  });
});
