import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SetupAttentionBanner } from "@/components/SetupAttentionBanner";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

const setupStatusMock = vi.fn();
vi.mock("@/queries/adminSetupQueries", () => ({
  useSetupStatus: () => setupStatusMock(),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function renderBanner(isAdmin = true) {
  return render(<SetupAttentionBanner isAdmin={isAdmin} />, { wrapper: makeWrapper() });
}

beforeEach(() => {
  navigateMock.mockClear();
  setupStatusMock.mockClear();
});

describe("SetupAttentionBanner", () => {
  it("Case A: renders both outstanding item labels when needsAttention is true", () => {
    setupStatusMock.mockReturnValue({
      data: {
        needsAttention: true,
        items: [
          { key: "smtp", satisfied: false, fixable: "ui", deepLink: "email" },
          { key: "mercure", satisfied: false, fixable: "infra", deepLink: null },
        ],
      },
    });

    renderBanner();

    expect(screen.getByText("Configure email (SMTP)")).toBeInTheDocument();
    expect(screen.getByText("Mercure real-time URL not configured")).toBeInTheDocument();
  });

  it("Case A: clicking smtp button navigates to /admin/settings with tab=email", async () => {
    setupStatusMock.mockReturnValue({
      data: {
        needsAttention: true,
        items: [
          { key: "smtp", satisfied: false, fixable: "ui", deepLink: "email" },
          { key: "mercure", satisfied: false, fixable: "infra", deepLink: null },
        ],
      },
    });

    renderBanner();

    await userEvent.click(screen.getByText("Configure email (SMTP)"));

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/admin/settings",
      search: { tab: "email" },
    });
  });

  it("Case A: clicking mercure button navigates to /admin/health", async () => {
    setupStatusMock.mockReturnValue({
      data: {
        needsAttention: true,
        items: [
          { key: "smtp", satisfied: false, fixable: "ui", deepLink: "email" },
          { key: "mercure", satisfied: false, fixable: "infra", deepLink: null },
        ],
      },
    });

    renderBanner();

    await userEvent.click(screen.getByText("Mercure real-time URL not configured"));

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith({ to: "/admin/health" });
  });

  it("Case B: renders nothing when needsAttention is false", () => {
    setupStatusMock.mockReturnValue({
      data: {
        needsAttention: false,
        items: [],
      },
    });

    const { container } = renderBanner();

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when data is undefined (loading state)", () => {
    setupStatusMock.mockReturnValue({ data: undefined });

    const { container } = renderBanner();

    expect(container).toBeEmptyDOMElement();
  });
});
