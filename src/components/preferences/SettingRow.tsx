import type { ReactNode } from "react";

export function SettingRow({
  label,
  hint,
  children,
  footer,
  danger = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-[10px] border bg-surface px-3 py-2.5 ${
        danger ? "border-danger/45" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-4 max-md:flex-col max-md:items-stretch max-md:gap-2.5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg">{label}</div>
          {hint && <div className="mt-0.5 max-w-[46ch] text-xs text-fg-muted">{hint}</div>}
        </div>
        {children && (
          <div className="flex flex-none flex-wrap items-center gap-2 max-md:w-full">
            {children}
          </div>
        )}
      </div>
      {footer && <div className="mt-2.5 border-t border-line pt-2.5">{footer}</div>}
    </div>
  );
}
