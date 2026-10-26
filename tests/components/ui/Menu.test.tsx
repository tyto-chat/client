import { afterEach, describe, it, expect, vi } from "vitest";
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

  describe("placement near the bottom of the viewport", () => {
    afterEach(() => vi.restoreAllMocks());

    function layout(triggerTop: number, menuHeight: number) {
      vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this.getAttribute("role") === "menu") {
          const top = parseFloat(this.style.top) || 0;
          return DOMRect.fromRect({ x: 20, y: top, width: 180, height: menuHeight });
        }
        if (this.getAttribute("aria-haspopup") === "menu") {
          return DOMRect.fromRect({ x: 20, y: triggerTop, width: 24, height: 24 });
        }
        return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
      });
    }

    async function openMenu() {
      render(
        <Menu trigger={<span>Open</span>} label="Actions">
          <MenuItem onSelect={() => {}}>Edit</MenuItem>
        </Menu>,
      );
      await userEvent.click(screen.getByText("Open"));
      return screen.getByRole("menu");
    }

    it("opens below the trigger when there is room", async () => {
      layout(100, 200);
      expect((await openMenu()).style.top).toBe("128px");
    });

    it("opens above the trigger when it would overflow the bottom", async () => {
      layout(560, 200);
      expect((await openMenu()).style.top).toBe("356px");
    });

    it("stays on screen when there is room neither above nor below", async () => {
      layout(300, 550);
      expect((await openMenu()).style.top).toBe("42px");
    });
  });
});
