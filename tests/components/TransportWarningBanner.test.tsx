import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransportWarningBanner } from "@/components/TransportWarningBanner";

const transportMock = vi.fn();
vi.mock("@/hooks/useApiTransport", () => ({
  useApiTransport: () => transportMock(),
}));

beforeEach(() => {
  transportMock.mockReset();
  sessionStorage.clear();
});

describe("TransportWarningBanner", () => {
  it("renders nothing while the transport is unknown", () => {
    transportMock.mockReturnValue("unknown");
    const { container } = render(<TransportWarningBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing over HTTP/2", () => {
    transportMock.mockReturnValue("modern");
    const { container } = render(<TransportWarningBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("warns over HTTP/1.1 and links to the reverse-proxy docs", () => {
    transportMock.mockReturnValue("legacy");
    render(<TransportWarningBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("Connection problem");
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute(
      "href",
      "https://tyto.chat/docs/reverse-proxy",
    );
  });

  it("stays dismissed for the session", async () => {
    transportMock.mockReturnValue("legacy");
    const first = render(<TransportWarningBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    first.unmount();

    const { container } = render(<TransportWarningBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
