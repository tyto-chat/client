import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PurgedAttachmentsNote } from "@/components/chat/PurgedAttachmentsNote";

describe("PurgedAttachmentsNote", () => {
  it("renders nothing at count 0", () => {
    const { container } = render(<PurgedAttachmentsNote count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders singular text", () => {
    render(<PurgedAttachmentsNote count={1} />);
    expect(screen.getByText("Attachment removed")).toBeInTheDocument();
  });

  it("renders plural text with count", () => {
    render(<PurgedAttachmentsNote count={3} />);
    expect(screen.getByText("3 attachments removed")).toBeInTheDocument();
  });
});
