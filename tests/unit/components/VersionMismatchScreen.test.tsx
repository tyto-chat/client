import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VersionMismatchScreen } from "@/components/VersionMismatchScreen";

describe("VersionMismatchScreen", () => {
  it("tells the user to update the app when the server is newer", () => {
    render(<VersionMismatchScreen direction="server-newer" />);
    expect(screen.getByText(/update/i)).toBeInTheDocument();
  });

  it("points at the server admin when the server is older", () => {
    render(<VersionMismatchScreen direction="server-older" />);
    expect(screen.getByText(/server/i)).toBeInTheDocument();
  });
});
