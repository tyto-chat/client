export const sectionHeading =
  "mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg before:h-3.5 before:w-1 before:rounded-full before:bg-accent-gradient";

const sidebarRowBase = "my-px flex items-center gap-2 rounded-lg px-2.5 py-[5px] text-sm";

export const sidebarRow = `${sidebarRowBase} text-fg-muted hover:bg-raised hover:text-fg`;

export const sidebarRowUnread = `${sidebarRowBase} font-semibold text-fg hover:bg-raised`;

export const sidebarRowActive = `${sidebarRowBase} bg-raised text-accent shadow-soft-sm ring-1 ring-[var(--accent)]/15`;
