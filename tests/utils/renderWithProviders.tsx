import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import type { useAuthContext } from "@/context/AuthContext";
import type { useNotification } from "@/context/NotificationContext";
import { mockUser } from "../fixtures";

// Derive types from source context hooks — no re-declaration needed.
type AuthState = ReturnType<typeof useAuthContext>;
type NotificationContextValue = ReturnType<typeof useNotification>;

// Mock auth context (avoids real AuthProvider side-effects in tests)

const MockAuthContext = createContext<AuthState | null>(null);

export function useMockAuth(): AuthState {
  const ctx = useContext(MockAuthContext);
  if (!ctx) throw new Error("useMockAuth must be used within renderWithProviders");
  return ctx;
}

export const defaultAuthState: AuthState = {
  token: "mock-jwt-token",
  user: mockUser,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn().mockResolvedValue(undefined),
  sessionExpired: false,
  mercureToken: "mock-mercure-token",
  refreshMercureToken: vi.fn().mockResolvedValue(undefined),
  ensureMercureTopic: vi.fn(),
};

const MockNotificationContext = createContext<NotificationContextValue | null>(null);

export function useMockNotification(): NotificationContextValue {
  const ctx = useContext(MockNotificationContext);
  if (!ctx) throw new Error("useMockNotification must be used within renderWithProviders");
  return ctx;
}

interface RenderOptions_ extends Omit<RenderOptions, "wrapper"> {
  authState?: Partial<AuthState>;
  notifyFn?: NotificationContextValue["notify"];
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactNode,
  { authState, notifyFn, ...renderOptions }: RenderOptions_ = {},
): RenderResult {
  const auth: AuthState = { ...defaultAuthState, ...authState };
  const notify: NotificationContextValue["notify"] = notifyFn ?? vi.fn();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={makeQueryClient()}>
        <MockAuthContext.Provider value={auth}>
          <MockNotificationContext.Provider value={{ notify }}>
            {children}
          </MockNotificationContext.Provider>
        </MockAuthContext.Provider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
