import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TotpCellsInput } from "@/components/authUi";

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <TotpCellsInput
        value={code}
        onChange={setCode}
        ariaLabel="Two-factor code"
        testId="totp-input"
        cellTestIdPrefix="totp-cell"
      />
    </form>
  );
}

describe("TotpCellsInput", () => {
  it("renders typed digits into cells", async () => {
    render(<Harness onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByTestId("totp-input"), "123");
    expect(screen.getByTestId("totp-cell-0")).toHaveTextContent("1");
    expect(screen.getByTestId("totp-cell-1")).toHaveTextContent("2");
    expect(screen.getByTestId("totp-cell-2")).toHaveTextContent("3");
    expect(screen.getByTestId("totp-cell-3")).toHaveTextContent("");
  });

  it("focuses itself when mounted after the surrounding step changes", async () => {
    function StepHarness() {
      const [showCode, setShowCode] = useState(false);
      return showCode ? (
        <Harness onSubmit={vi.fn()} />
      ) : (
        <button onClick={() => setShowCode(true)}>Sign in</button>
      );
    }
    render(<StepHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByTestId("totp-input")).toHaveFocus();
  });

  it("filters non-digits and caps at 6", async () => {
    render(<Harness onSubmit={vi.fn()} />);
    const input = screen.getByTestId<HTMLInputElement>("totp-input");
    await userEvent.type(input, "1a2b3c4d5e6f7");
    expect(input.value).toBe("123456");
  });

  it("submits the surrounding form on the 6th digit", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByTestId("totp-input");
    await userEvent.type(input, "12345");
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.type(input, "6");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
