import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import { PlusIcon } from "@/components/icons";

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
  layout?: "rows" | "chips";
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
  layout = "rows",
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
      {results.length > 0 && layout === "chips" && (
        <ul className="flex flex-wrap gap-1.5 max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1">
          {results.map((item) => (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                data-testid={`picker-chip-${item.id}`}
                onClick={() => handleAdd(item)}
                disabled={isPending}
                title={item.name}
                className="flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-2 text-xs font-medium text-fg ring-1 ring-inset ring-line transition hover:bg-raised disabled:opacity-50 dark:text-white"
              >
                <Avatar
                  name={item.name}
                  colorKey={String(item.id)}
                  imageUrl={item.avatarUrl ?? null}
                  size="xs"
                />
                <span className="max-w-32 truncate">{item.name}</span>
                <PlusIcon size={11} className="shrink-0 text-fg-subtle" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {results.length > 0 && layout === "rows" && (
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
