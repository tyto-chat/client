interface Props {
  parts: string[];
}

export function LinkedMessageHeader({ parts }: Props) {
  if (parts.length === 0) return null;
  return (
    <div
      data-testid="linked-message-header"
      className="mb-0.5 truncate text-[0.625rem] text-fg-subtle"
    >
      {parts.join(" · ")}
    </div>
  );
}
