import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, children, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-fg">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-10 rounded-md border bg-canvas px-3 text-sm text-fg",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          error ? "border-danger" : "border-line",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p id={`${fieldId}-err`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
