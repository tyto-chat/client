import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu, MenuItem } from "@/components/ui/Menu";

describe("Menu", () => {
  it("opens on trigger click and closes on Escape", async () => {
    render(
      <Menu trigger={<span>Open</span>} label="Actions">
        <MenuItem onSelect={() => {}}>Edit</MenuItem>
        <MenuItem onSelect={() => {}}>Delete</MenuItem>
      </Menu>,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("menu")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("fires onSelect and closes when an item is chosen", async () => {
    let picked = "";
    render(
      <Menu trigger={<span>Open</span>} label="Actions">
        <MenuItem onSelect={() => (picked = "edit")}>Edit</MenuItem>
      </Menu>,
    );
    await userEvent.click(screen.getByText("Open"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(picked).toBe("edit");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("ArrowDown moves focus to the first item, ArrowUp to the last", async () => {
    render(
      <Menu trigger={<span>Open</span>} label="Actions">
        <MenuItem onSelect={() => {}}>Edit</MenuItem>
        <MenuItem onSelect={() => {}}>Delete</MenuItem>
      </Menu>,
    );
    await userEvent.click(screen.getByText("Open"));
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit" }));
    await userEvent.keyboard("{ArrowUp}");
    // from first item, ArrowUp wraps to the last item
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }));
  });
});
