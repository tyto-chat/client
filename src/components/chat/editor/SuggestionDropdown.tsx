import { Fragment } from "react";
import type { SuggestionState } from "@/utils/mentionSuggestion";

export function SuggestionDropdown<T>({
  suggestion,
  getKey,
  emptyMessage,
  renderItem,
  rootRef,
  getTestId,
  getGroup,
  groupLabels,
  widthClass = "min-w-40 max-w-64",
}: {
  suggestion: SuggestionState<T>;
  getKey: (item: T) => string;
  emptyMessage: string;
  renderItem: (item: T, isActive: boolean) => React.ReactNode;
  rootRef?: React.Ref<HTMLDivElement>;
  getTestId?: (item: T) => string | undefined;
  getGroup?: (item: T) => string;
  groupLabels?: Record<string, string>;
  widthClass?: string;
}) {
  if (!suggestion.visible || !suggestion.rect) return null;
  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        bottom: `${window.innerHeight - suggestion.rect.top + 4}px`,
        left: `${suggestion.rect.left}px`,
        zIndex: 50,
      }}
      className={`rounded-xl border border-line bg-overlay shadow-soft-md overflow-hidden ${widthClass}`}
    >
      {suggestion.items.length === 0 ? (
        <div className="px-3 py-1.5 text-sm text-fg-subtle">{emptyMessage}</div>
      ) : (
        suggestion.items.map((item, i) => {
          const group = getGroup?.(item);
          const prev = i > 0 ? suggestion.items[i - 1] : undefined;
          const prevGroup = prev === undefined ? undefined : getGroup?.(prev);
          const showHeader = group !== undefined && group !== prevGroup;
          return (
            <Fragment key={getKey(item)}>
              {showHeader && (
                <>
                  {i > 0 && <div className="my-1 h-px bg-line" />}
                  <div className="px-3 pb-0.5 pt-2 text-[0.65625rem] font-semibold uppercase tracking-wider text-fg-subtle">
                    {groupLabels?.[group] ?? group}
                  </div>
                </>
              )}
              <button
                type="button"
                data-testid={getTestId?.(item)}
                className={`w-full text-left px-3 py-1.5 text-sm ${
                  i === suggestion.index
                    ? "bg-[var(--accent-light)] text-[var(--accent-text-on-light)] dark:bg-[var(--accent-dark)] dark:text-[var(--accent-text-dark)]"
                    : "text-fg hover:bg-surface"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  suggestion.selectItem?.(i);
                }}
              >
                {renderItem(item, i === suggestion.index)}
              </button>
            </Fragment>
          );
        })
      )}
    </div>
  );
}
