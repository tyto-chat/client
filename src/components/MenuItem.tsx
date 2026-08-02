import type React from "react";
import { cn } from "@/utils/cn";

interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  "data-testid"?: string;
}

export function MenuItem({
  onClick,
  children,
  className,
  disabled,
  title,
  "data-testid": testId,
  ...rest
}: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={cn(
        "w-full px-3 py-2 text-left text-sm text-fg hover:bg-raised hover:text-fg dark:hover:text-white",
        disabled && "opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
