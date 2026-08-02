export function SortableTh<C extends string>({
  label,
  column,
  sort,
  dir,
  onSort,
  className = "",
}: {
  label: string;
  column: C;
  sort: string | undefined;
  dir: "ASC" | "DESC";
  onSort: (column: C) => void;
  className?: string;
}) {
  const active = sort === column;
  return (
    <th
      className={`px-4 py-3 ${className}`}
      aria-sort={active ? (dir === "ASC" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-fg ${active ? "text-fg" : ""}`}
      >
        {label}
        <span aria-hidden className={active ? "" : "opacity-0"}>
          {active && dir === "ASC" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}
