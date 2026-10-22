import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createContext, useContext, type ReactNode } from "react";
import { useMercureSubscription } from "@/hooks/useMercureSubscription";
import type { useAuthContext } from "@/context/AuthContext";
import type { useNotification } from "@/context/NotificationContext";
import { getLastFakeEventSource } from "../../mocks/EventSource";

// Derive types from source hooks — no re-declaration needed.
type AuthState = ReturnType<typeof useAuthContext>;
type NotificationContextValue = ReturnType<typeof useNotification>;

// Minimal context stubs (only the fields the hook under test reads)

const MockAuthContext = createContext<Pick<AuthState, "mercureToken" | "refreshMercureToken">>({
  mercureToken: null,
  refreshMercureToken: vi.fn(),
});

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => useContext(MockAuthContext),
}));

const MockNotificationContext = createContext<NotificationContextValue>({
  notify: vi.fn(),
});

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => useContext(MockNotificationContext),
}));

// Patch getServerInfo so subscribeMercure gets a hub URL
vi.mock("@/api/serverInfo", () => ({
  getServerInfo: () => ({
    mercureUrl: "https://mercure.example.com/.well-known/mercure",
  }),
}));

type StubAuthState = Pick<AuthState, "mercureToken" | "refreshMercureToken">;

function makeWrapper(auth: StubAuthState, notify: NotificationContextValue["notify"]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MockAuthContext.Provider value={auth}>
        <MockNotificationContext.Provider value={{ notify }}>
          {children}
        </MockNotificationContext.Provider>
      </MockAuthContext.Provider>
    );
  };
}

describe("useMercureSubscription", () => {
  const topic = "/api/channels/1";
  const onMessage = vi.fn();
  const errorMessage = "Connection lost";

  beforeEach(() => {
    onMessage.mockClear();
  });

  it("creates an EventSource when topic and mercureToken are set", () => {
    const auth: StubAuthState = { mercureToken: "token-abc", refreshMercureToken: vi.fn() };

    renderHook(() => useMercureSubscription(topic, onMessage, errorMessage), {
      wrapper: makeWrapper(auth, vi.fn()),
    });

    const es = getLastFakeEventSource();
    expect(es).toBeDefined();
    expect(es!.url).toContain("mercure.example.com");
    expect(es!.url).toContain(encodeURIComponent(topic));
  });

  it("does NOT subscribe when topic is null", () => {
    const auth: StubAuthState = { mercureToken: "token-abc", refreshMercureToken: vi.fn() };

    renderHook(() => useMercureSubscription(null, onMessage, errorMessage), {
      wrapper: makeWrapper(auth, vi.fn()),
    });

    expect(getLastFakeEventSource()).toBeUndefined();
  });

  it("does NOT subscribe when mercureToken is null", () => {
    const auth: StubAuthState = { mercureToken: null, refreshMercureToken: vi.fn() };

    renderHook(() => useMercureSubscription(topic, onMessage, errorMessage), {
      wrapper: makeWrapper(auth, vi.fn()),
    });

    expect(getLastFakeEventSource()).toBeUndefined();
  });

  it("calls onMessage when the EventSource dispatches a message", () => {
    const auth: StubAuthState = { mercureToken: "token-abc", refreshMercureToken: vi.fn() };

    renderHook(() => useMercureSubscription(topic, onMessage, errorMessage), {
      wrapper: makeWrapper(auth, vi.fn()),
    });

    const es = getLastFakeEventSource()!;
    act(() => es.dispatch(JSON.stringify({ id: 1 })));
    expect(onMessage).toHaveBeenCalledOnce();
  });

  it("does not refresh the token on the first error — backs off and reconnects", () => {
    vi.useFakeTimers();
    const refreshMercureToken = vi.fn().mockResolvedValue(undefined);
    const auth: StubAuthState = { mercureToken: "token-abc", refreshMercureToken };

    renderHook(() => useMercureSubscription(topic, onMessage, errorMessage), {
      wrapper: makeWrapper(auth, vi.fn()),
    });

    const es1 = getLastFakeEventSource()!;
    act(() => es1.triggerError());
    // A single transient error just schedules a backoff reconnect — no refresh.
    expect(refreshMercureToken).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(5000));
    // A fresh EventSource was opened (self-heal without a remount).
    expect(getLastFakeEventSource()).not.toBe(es1);
    vi.useRealTimers();
  });

  it("refreshes the token after repeated failures and notifies on sustained failure", () => {
    vi.useFakeTimers();
    const refreshMercureToken = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();
    const auth: StubAuthState = { mercureToken: "token-abc", refreshMercureToken };

    renderHook(() => useMercureSubscription(topic, onMessage, errorMessage), {
      wrapper: makeWrapper(auth, notify),
    });

    // Drive several error → backoff-reconnect cycles.
    for (let i = 0; i < 5; i++) {
      act(() => getLastFakeEventSource()!.triggerError());
      act(() => vi.advanceTimersByTime(35000));
    }

    // Token refresh is nudged every 4th failure; the degraded-realtime toast
    // fires once failures persist. Reconnection keeps going regardless.
    expect(refreshMercureToken).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(errorMessage, "error");
    vi.useRealTimers();
  });

  it("closes EventSource on unmount", () => {
    const auth: StubAuthState = { mercureToken: "token-abc", refreshMercureToken: vi.fn() };

    const { unmount } = renderHook(() => useMercureSubscription(topic, onMessage, errorMessage), {
      wrapper: makeWrapper(auth, vi.fn()),
    });

    const es = getLastFakeEventSource()!;
    const closeSpy = vi.spyOn(es, "close");
    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("does not re-subscribe when only onMessage reference changes", () => {
    const auth: StubAuthState = { mercureToken: "token-abc", refreshMercureToken: vi.fn() };
    let handler = vi.fn();

    const { rerender } = renderHook(() => useMercureSubscription(topic, handler, errorMessage), {
      wrapper: makeWrapper(auth, vi.fn()),
    });

    const firstEs = getLastFakeEventSource();

    // Replace handler reference (simulates inline function re-creation on render)
    handler = vi.fn();
    rerender();

    expect(getLastFakeEventSource()).toBe(firstEs);
  });

  describe("when the realtime token changes", () => {
    function jwt(subscribe: string[]): string {
      const body = btoa(JSON.stringify({ mercure: { subscribe } }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      return `h.${body}.s`;
    }
    const scopedA = jwt(["u/42/n", "u/{userId}/p", "k/5", "c/12"]);
    const scopedB = jwt(["u/42/n", "u/{userId}/p", "k/9", "c/30"]);

    function renderWithToken(subscribeTo: string | string[], initial: string) {
      const auth: StubAuthState = { mercureToken: initial, refreshMercureToken: vi.fn() };
      function Wrapper({ children }: { children: ReactNode }) {
        return (
          <MockAuthContext.Provider value={{ ...auth }}>
            <MockNotificationContext.Provider value={{ notify: vi.fn() }}>
              {children}
            </MockNotificationContext.Provider>
          </MockAuthContext.Provider>
        );
      }
      const view = renderHook(() => useMercureSubscription(subscribeTo, onMessage, errorMessage), {
        wrapper: Wrapper,
      });
      return {
        setToken: (next: string) => {
          auth.mercureToken = next;
          view.rerender();
        },
      };
    }

    it("keeps a connection the previous token already covered", () => {
      const { setToken } = renderWithToken("u/42/n", scopedA);
      const first = getLastFakeEventSource();

      setToken(scopedB);

      expect(getLastFakeEventSource()).toBe(first);
    });

    it("keeps presence connections, which the template always covers", () => {
      const { setToken } = renderWithToken(["u/7/p", "u/8/p"], scopedA);
      const first = getLastFakeEventSource();

      setToken(scopedB);

      expect(getLastFakeEventSource()).toBe(first);
    });

    it("reconnects with the new token when only it grants the topic", () => {
      const { setToken } = renderWithToken("c/30", scopedA);
      const first = getLastFakeEventSource()!;
      const closeSpy = vi.spyOn(first, "close");

      setToken(scopedB);

      const second = getLastFakeEventSource()!;
      expect(second).not.toBe(first);
      expect(closeSpy).toHaveBeenCalled();
      expect(second.url).toContain(`authorization=${scopedB}`);
    });

    it("retries after an error with the latest token, not the one it connected with", () => {
      vi.useFakeTimers();
      const { setToken } = renderWithToken("u/42/n", scopedA);
      const first = getLastFakeEventSource()!;
      setToken(scopedB);
      expect(getLastFakeEventSource()).toBe(first);

      act(() => first.triggerError());
      act(() => vi.advanceTimersByTime(5000));

      expect(getLastFakeEventSource()!.url).toContain(`authorization=${scopedB}`);
      vi.useRealTimers();
    });
  });
});
