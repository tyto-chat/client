import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";

export interface PickerItem {
  id: number;
  name: string;
  subtitle?: string;
  avatarUrl?: string | null;
}

interface Props {
  placeholder: string;
  query: string;
  onQueryChange: (q: string) => void;
  results: PickerItem[];
  buttonLabel: string;
  onAdd: (item: PickerItem) => void;
  isPending?: boolean;
  buttonClass?: string;
  autoFocus?: boolean;
}

const DEFAULT_BUTTON_CLASS =
  "bg-[var(--accent-strong)] text-on-accent shadow-soft-sm transition hover:opacity-90";

export function UserPicker({
  placeholder,
  query,
  onQueryChange,
  results,
  buttonLabel,
  onAdd,
  isPending = false,
  buttonClass = DEFAULT_BUTTON_CLASS,
  autoFocus = false,
}: Props) {
  const { t } = useTranslation(["community", "common"]);

  function handleAdd(item: PickerItem) {
    onAdd(item);
    onQueryChange("");
  }

  return (
    <div className="space-y-1.5">
      <input
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => onQueryChange(e.target.value)}
        className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
      />
      {results.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-lg bg-canvas ring-1 ring-inset ring-line">
          {results.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar
                  name={item.name}
                  colorKey={String(item.id)}
                  imageUrl={item.avatarUrl ?? null}
                  size="xs"
                />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-fg dark:text-white">{item.name}</span>
                  {item.subtitle && (
                    <span className="truncate text-xs text-fg-muted">{item.subtitle}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAdd(item)}
                disabled={isPending}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${buttonClass}`}
              >
                {buttonLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length > 0 && results.length === 0 && (
        <p className="text-xs text-fg-subtle">{t("common:no_matches")}</p>
      )}
    </div>
  );
}
