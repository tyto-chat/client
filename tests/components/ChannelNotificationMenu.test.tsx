import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChannelNotificationMenu } from "@/components/ChannelNotificationMenu";

function renderMenu() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChannelNotificationMenu
        communityIdentifier="community"
        channelIdentifier="general"
        channelId={1}
      />
    </QueryClientProvider>,
  );
}

describe("ChannelNotificationMenu", () => {
  it("sets its own text colour, because it renders outside the themed app shell", async () => {
    renderMenu();

    await userEvent.click(screen.getByTestId("channel-notif-menu-btn"));

    const option = screen.getByTestId("notif-level-all");
    expect(option.parentElement).toBe(document.body.lastElementChild);
    expect(option.className).toContain("text-fg");
  });
});
