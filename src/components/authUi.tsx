import { useState } from "react";

export const inputClass =
  "w-full rounded-md border border-line-strong bg-raised px-3 py-2 text-fg outline-none placeholder:text-fg-subtle focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)] dark:text-white";

export const labelClass =
  "mb-1.5 block text-[12.5px] font-semibold tracking-[0.01em] text-fg-muted";

export const primaryButtonClass =
  "w-full rounded-md bg-accent-gradient py-2.5 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50";

export const ghostButtonClass =
  "w-full py-1.5 text-center text-[13px] font-medium text-fg-muted underline decoration-fg-muted/45 underline-offset-[3px] transition hover:text-fg disabled:opacity-50";

export function ErrorBanner({ message }: { message: string }) {
  const separatorIndex = message.indexOf(". ");
  const lead = separatorIndex === -1 ? message : message.slice(0, separatorIndex + 1);
  const rest = separatorIndex === -1 ? "" : message.slice(separatorIndex + 1).trim();
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-danger/35 bg-danger-subtle px-3 py-2.5 text-[13px] text-fg">
      <span>
        <b className="text-danger">{lead}</b>
        {rest && ` ${rest}`}
      </span>
    </div>
  );
}

export function TotpCellsInput({
  value,
  onChange,
  ariaLabel,
  testId,
  cellTestIdPrefix,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  testId: string;
  cellTestIdPrefix: string;
  id?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <div className="flex gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => {
          const char = value[i] ?? "";
          const isActive = focused && value.length === i;
          return (
            <div
              key={i}
              data-testid={`${cellTestIdPrefix}-${i}`}
              className={`flex h-13 w-11 items-center justify-center rounded-md border bg-raised font-mono text-xl text-fg ${
                isActive
                  ? "border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]"
                  : "border-line-strong"
              }`}
            >
              {char}
            </div>
          );
        })}
      </div>
      <input
        id={id}
        autoFocus
        value={value}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(next);
          if (next.length === 6) {
            const form = e.currentTarget.form;
            queueMicrotask(() => form?.requestSubmit());
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
        data-testid={testId}
      />
    </div>
  );
}
