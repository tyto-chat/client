import type React from "react";

interface IconButtonProps {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
  active?: boolean;
  size?: "sm" | "md";
  className?: string;
  testId?: string;
}

export function IconButton({
  title,
  onClick,
  children,
  active = false,
  size = "sm",
  className,
  testId,
}: IconButtonProps) {
  if (size === "md") {
    return (
      <button
        onClick={onClick}
        title={title}
        data-testid={testId}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
          active ? "bg-red-500 text-white hover:bg-red-600" : "bg-surface text-fg hover:bg-raised"
        } ${className ?? ""}`}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      title={title}
      onClick={onClick}
      data-testid={testId}
      className={`flex items-center justify-center rounded p-1 text-fg-muted transition-colors hover:bg-surface hover:text-fg [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
