import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
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

describe("MessageComposer collapsed mode", () => {
  it("expands when the padding around the collapsed input is clicked, not just the text line", async () => {
    const { container } = render(<MessageComposer onSend={vi.fn()} />, { wrapper: makeWrapper() });

    expect(screen.queryByTitle("Bold")).not.toBeInTheDocument();

    const shell = container.querySelector(".rounded-xl");
    expect(shell).not.toBeNull();
    fireEvent.mouseDown(shell!);

    expect(await screen.findByTitle("Bold")).toBeInTheDocument();
  });

  it("leaves the send button click alone while collapsed", () => {
    const onSend = vi.fn();
    render(<MessageComposer onSend={onSend} />, { wrapper: makeWrapper() });

    const send = screen.getByLabelText("Send");
    fireEvent.mouseDown(send);

    expect(screen.queryByTitle("Bold")).not.toBeInTheDocument();
  });
});

describe("MessageComposer disabled send button", () => {
  it("keeps focus on the editor when the disabled send button is pressed", async () => {
    const { container } = render(<MessageComposer onSend={vi.fn()} />, { wrapper: makeWrapper() });

    const shell = container.querySelector(".rounded-xl")!;
    fireEvent.mouseDown(shell);
    expect(await screen.findByTitle("Bold")).toBeInTheDocument();

    const send = screen.getByLabelText("Send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const event = createEvent.mouseDown(send, { bubbles: true });
    fireEvent(send, event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTitle("Bold")).toBeInTheDocument();
  });
});
