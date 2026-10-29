import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CreationBlockedNotice } from "@/components/dm/CreationBlockedNotice";

const names = (ids: number[]) => ids.map((id) => (id === 1 ? "you" : `User ${id}`)).join(", ");

function blocked(reason: string, refusing: number[] = [], unreachable: number[] = []) {
  return {
    kind: "blocked" as const,
    reason,
    refusingUserIds: refusing,
    unreachableUserIds: unreachable,
  };
}

describe("CreationBlockedNotice", () => {
  it("outcome_blocked_when_required_and_peer_unreachable", () => {
    render(
      <CreationBlockedNotice
        outcome={blocked("operator_required", [], [2])}
        names={names}
        group={false}
      />,
    );
    expect(
      screen.getByText(/only allows end-to-end encrypted direct messages, and User 2/),
    ).toBeInTheDocument();
  });

  it("outcome_blocked_when_peer_refuses_plain_names_peer", () => {
    render(
      <CreationBlockedNotice
        outcome={blocked("participant_refuses", [2], [2])}
        names={names}
        group={false}
      />,
    );
    expect(
      screen.getByText(/User 2 only accepts end-to-end encrypted direct messages/),
    ).toBeInTheDocument();
  });

  it("outcome_blocked_when_self_refuses_plain", () => {
    render(
      <CreationBlockedNotice
        outcome={blocked("self_refuses", [1], [2])}
        names={names}
        group={false}
      />,
    );
    expect(
      screen.getByText(/You only accept end-to-end encrypted direct messages, and User 2/),
    ).toBeInTheDocument();
  });

  it("group_compose_blocked_when_required", () => {
    render(<CreationBlockedNotice outcome={blocked("group_not_available")} names={names} group />);
    expect(screen.getByText(/not available for groups yet/)).toBeInTheDocument();
  });

  it("web client is told to open the desktop app, never offered plain", () => {
    render(
      <CreationBlockedNotice
        outcome={{ kind: "client_not_ready", why: "web" }}
        names={names}
        group={false}
      />,
    );
    expect(screen.getByText(/Open the tyto.chat desktop app/)).toBeInTheDocument();
    expect(screen.queryByTestId("e2ee-plain-fallback-confirm")).toBeNull();
  });

  it("unrestored desktop is told to restore", () => {
    render(
      <CreationBlockedNotice
        outcome={{ kind: "client_not_ready", why: "not_restored" }}
        names={names}
        group={false}
      />,
    );
    expect(screen.getByText(/restore encryption on this device/)).toBeInTheDocument();
  });
});
