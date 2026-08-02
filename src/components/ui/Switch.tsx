export function Switch({
  checked,
  onChange,
  disabled = false,
  testId,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  testId?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={onChange}
      className={`relative h-[22px] w-[38px] flex-none rounded-full border transition-colors disabled:opacity-40 ${
        checked ? "border-transparent bg-accent-gradient" : "border-line-strong bg-raised"
      }`}
    >
      <span
        className={`absolute top-[2px] h-4 w-4 rounded-full transition-all ${
          checked ? "left-[18px] bg-white" : "left-[2px] bg-fg-subtle"
        }`}
      />
    </button>
  );
}
