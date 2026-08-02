import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { CodeInput } from "@/components/ui/CodeInput";

function Harness({ onValue }: { onValue?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <CodeInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

function boxes(): HTMLInputElement[] {
  return screen.getAllByRole("textbox") as HTMLInputElement[];
}

describe("CodeInput", () => {
  it("renders six boxes and advances focus while typing", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const inputs = boxes();
    expect(inputs).toHaveLength(6);

    await userEvent.click(inputs[0]!);
    await userEvent.keyboard("123456");

    expect(onValue).toHaveBeenLastCalledWith("123456");
    inputs.forEach((input, i) => expect(input.value).toBe(String(i + 1)));
  });

  it("distributes a pasted code across the boxes", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const inputs = boxes();

    await userEvent.click(inputs[0]!);
    await userEvent.paste("42 13-37");

    expect(onValue).toHaveBeenLastCalledWith("421337");
    expect(inputs[5]!.value).toBe("7");
  });

  it("ignores non-digits", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    await userEvent.click(boxes()[0]!);
    await userEvent.keyboard("a1b2");

    expect(onValue).toHaveBeenLastCalledWith("12");
  });

  it("backspace clears backwards across boxes", async () => {
    render(<Harness />);
    const inputs = boxes();

    await userEvent.click(inputs[0]!);
    await userEvent.keyboard("123");
    await userEvent.keyboard("{Backspace}{Backspace}");

    expect(inputs[0]!.value).toBe("1");
    expect(inputs[1]!.value).toBe("");
    expect(inputs[2]!.value).toBe("");
  });

  it("fills every box from a full one-time-code autofill into the first input", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const inputs = boxes();

    await userEvent.click(inputs[0]!);
    await userEvent.type(inputs[0]!, "987654");

    expect(onValue).toHaveBeenLastCalledWith("987654");
  });
});
