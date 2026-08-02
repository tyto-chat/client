export function ToolbarButton({
  onClick,
  isActive,
  title,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        isActive
          ? "bg-accent-subtle text-accent ring-1 ring-inset ring-[var(--accent)]/40"
          : "text-fg-muted hover:bg-surface hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function MoreItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface ${
        active ? "bg-accent-subtle/60 font-medium text-accent" : "text-fg"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function Divider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />;
}
