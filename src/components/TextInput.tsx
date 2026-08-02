import { useId } from "react";
import type React from "react";

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
}

export function TextInput({ label, error, ...props }: TextInputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-fg-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-lg px-3 py-2 text-sm text-fg outline-none focus:ring-2 dark:text-white ${
          error
            ? "bg-red-100 focus:ring-red-400 dark:bg-red-900/30"
            : "bg-surface focus:ring-[var(--accent)]"
        }`}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
