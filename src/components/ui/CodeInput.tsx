import { useRef } from "react";

interface Props {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  idPrefix?: string;
}

export function CodeInput({
  length = 6,
  value,
  onChange,
  autoFocus = false,
  idPrefix = "code",
}: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function commit(next: string, focusIndex?: number) {
    onChange(next.slice(0, length));
    if (focusIndex !== undefined) {
      refs.current[Math.min(focusIndex, length - 1)]?.focus();
    }
  }

  function handleChange(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      commit(value.slice(0, index));
      return;
    }
    const next = (value.slice(0, index) + digits).slice(0, length);
    commit(next, next.length);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[index]) {
      e.preventDefault();
      commit(value.slice(0, Math.max(0, index - 1)), index - 1);
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (digits) commit(digits, digits.length);
  }

  return (
    <div className="flex gap-2">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={i === 0 ? idPrefix : `${idPrefix}-${i}`}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          maxLength={length}
          autoFocus={autoFocus && i === 0}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="h-12 w-10 rounded-lg bg-surface text-center text-lg font-semibold text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
        />
      ))}
    </div>
  );
}
