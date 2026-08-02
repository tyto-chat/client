import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { SubmitKeyProvider } from "@/context/SubmitKeyContext";
import MessageComposer from "@/components/chat/MessageComposer";

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));
vi.mock("@/queries/presenceQueries", () => ({
  usePresenceSubscription: () => {},
}));
vi.mock("@/hooks/useTypingPing", () => ({
  useTypingPing: () => () => {},
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SubmitKeyProvider>{children}</SubmitKeyProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("MessageComposer edit mode", () => {
  it("shows the emoji button when editing an existing message", () => {
    render(<MessageComposer initialContent="<p>hello</p>" onSend={vi.fn()} onCancel={vi.fn()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByTitle("Emoji")).toBeInTheDocument();
  });

  it("does not show the attach button in edit mode even when attachments are allowed", () => {
    render(
      <MessageComposer
        initialContent="<p>hello</p>"
        onSend={vi.fn()}
        onCancel={vi.fn()}
        allowAttachments
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.queryByTitle("Attach file")).not.toBeInTheDocument();
  });

  it("keeps both buttons in normal compose mode with attachments allowed", () => {
    render(<MessageComposer initialContent="<p>hello</p>" onSend={vi.fn()} allowAttachments />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByTitle("Emoji")).toBeInTheDocument();
    expect(screen.getByTitle("Attach file")).toBeInTheDocument();
  });
});
