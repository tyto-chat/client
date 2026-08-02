import { TytoMark } from "@/components/TytoMark";
import { BRAND_GRADIENT } from "./wizardStyles";

export function WizardPrimaryButton({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-accent-gradient px-4 py-1.5 text-sm font-semibold text-[var(--accent-on)] hover:opacity-90 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function WizardSwitch({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        on ? "bg-[var(--accent)]" : "bg-line-strong"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          on ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}

export function WizardRail({
  eyebrow,
  note,
  steps,
  current,
}: {
  eyebrow: string;
  note: string;
  steps: string[];
  current: number;
}) {
  return (
    <aside className="flex flex-row items-center gap-3 border-b border-line bg-surface px-4 py-3.5 sm:flex-col sm:items-stretch sm:gap-0 sm:border-b-0 sm:border-r sm:px-4 sm:py-5">
      <div className="flex items-center gap-2.5 text-base font-extrabold tracking-tight">
        <TytoMark size={30} />
        <span className="bg-clip-text text-transparent" style={{ backgroundImage: BRAND_GRADIENT }}>
          tyto.chat
        </span>
      </div>
      <p className="mt-3.5 mb-3 hidden text-[0.68rem] font-bold uppercase tracking-widest text-accent-text sm:block">
        {eyebrow}
      </p>
      <ol className="ml-auto flex gap-1.5 sm:ml-0 sm:flex-col sm:gap-0">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < current;
          const cur = n === current;
          return (
            <li
              key={label}
              className={`relative flex items-center gap-2.5 sm:py-1.5 ${
                cur ? "font-semibold text-fg" : "text-fg-muted"
              }`}
            >
              {n < steps.length && (
                <span
                  className={`absolute left-[11px] top-8 bottom-[-4px] hidden w-0.5 rounded sm:block ${
                    done ? "bg-success/50" : "bg-line-strong"
                  }`}
                />
              )}
              <span
                className={`relative z-10 grid h-[23px] w-[23px] flex-none place-items-center rounded-full text-[0.72rem] font-bold ${
                  cur
                    ? "text-white shadow-soft-sm"
                    : done
                      ? "bg-success-subtle text-success"
                      : "bg-raised text-fg-subtle ring-1 ring-inset ring-line-strong"
                }`}
                style={cur ? { background: BRAND_GRADIENT } : undefined}
              >
                {done ? "✓" : n}
              </span>
              <span className="hidden text-sm sm:inline">{label}</span>
            </li>
          );
        })}
      </ol>
      <div className="hidden flex-1 sm:block" />
      <p className="hidden text-[0.7rem] text-fg-subtle sm:block">{note}</p>
    </aside>
  );
}
