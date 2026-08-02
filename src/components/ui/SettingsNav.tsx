import type { LucideIcon } from "lucide-react";

export interface SettingsNavGroup<K extends string> {
  heading: string;
  items: { key: K; label: string; icon: LucideIcon }[];
}

export function SettingsNav<K extends string>({
  groups,
  active,
  onChange,
  testIdPrefix,
}: {
  groups: SettingsNavGroup<K>[];
  active: K;
  onChange: (key: K) => void;
  testIdPrefix: string;
}) {
  return (
    <nav className="flex gap-1 max-md:flex-row max-md:overflow-x-auto max-md:pr-4 max-md:pb-0.5 max-md:[mask-image:linear-gradient(to_right,#000_calc(100%-1.75rem),transparent)] md:w-[200px] md:flex-col md:gap-4">
      {groups.map((group) => (
        <div key={group.heading} className="flex flex-col gap-1 max-md:contents">
          <p className="mb-1 px-2 text-xs font-bold uppercase tracking-wider text-fg max-md:hidden">
            {group.heading}
          </p>
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              data-testid={`${testIdPrefix}${item.key}`}
              aria-current={active === item.key ? "true" : undefined}
              onClick={() => onChange(item.key)}
              className={`flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors max-md:flex-none max-md:whitespace-nowrap ${
                active === item.key
                  ? "bg-accent-gradient text-on-accent"
                  : "text-fg-muted hover:bg-raised hover:text-fg"
              }`}
            >
              <item.icon size={15} strokeWidth={2} className="flex-none opacity-85" aria-hidden />
              <span className="block cap-trim">{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
