import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Select } from "@/components/ui/Select";

describe("Select", () => {
  it("renders options and associates the label", () => {
    render(
      <Select label="Role" id="role">
        <option value="admin">Admin</option>
        <option value="user">User</option>
      </Select>,
    );
    const select = screen.getByLabelText("Role");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByRole("option", { name: "Admin" })).toBeTruthy();
  });
});
