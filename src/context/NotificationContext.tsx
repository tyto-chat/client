/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

type NotificationType = "success" | "error" | "info";

interface Notification {
  id: number;
  message: ReactNode;
  type: NotificationType;
  leaving: boolean;
}

interface NotificationContextValue {
  notify: (message: ReactNode, type?: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const DISMISS_AFTER = 3500;
const LEAVE_DURATION = 250;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, leaving: true } : n)));
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, LEAVE_DURATION);
  }, []);

  const notify = useCallback(
    (message: ReactNode, type: NotificationType = "info") => {
      const id = nextId.current++;
      setNotifications((prev) => [...prev, { id, message, type, leaving: false }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER);
    },
    [dismiss],
  );

  const typeStyles: Record<NotificationType, string> = {
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-fg text-canvas",
  };

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-10 right-4 z-[100] flex flex-col items-end gap-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            role={n.type === "error" ? "alert" : "status"}
            aria-live={n.type === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            className={`pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 shadow-soft-lg text-sm font-medium max-w-xs ${typeStyles[n.type]} ${n.leaving ? "animate-notification-out" : "animate-notification-in"}`}
          >
            <span className="flex-1">{n.message}</span>
            <button
              onClick={() => dismiss(n.id)}
              className="shrink-0 text-white/70 hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be used within NotificationProvider");
  return ctx;
}
