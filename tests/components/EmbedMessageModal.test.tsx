import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmbedMessageModal } from "@/components/chat/EmbedMessageModal";
import { configureApiClient } from "@/api/client";

beforeEach(() => configureApiClient("https://server.example.com/api/v1"));

describe("EmbedMessageModal", () => {
  it("builds the snippet against the API server origin, not the page", () => {
    render(
      <EmbedMessageModal
        messageIri="/api/v1/messages/3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d"
        authorName="Ada"
        fallbackText="hello"
        channelLabel="#general"
        onClose={() => undefined}
      />,
    );

    const snippet = screen.getByTestId<HTMLTextAreaElement>("embed-snippet").value;
    expect(snippet).toContain('src="https://server.example.com/embed.js"');
    expect(snippet).toContain(
      'href="https://server.example.com/m/3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d"',
    );
    expect(snippet).not.toContain(window.location.origin);
  });
});
