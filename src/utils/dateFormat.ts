import i18n from "@/i18n";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
  locale: string,
  timeZone: string | undefined,
  shapeKey: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cacheKey = `${locale}|${timeZone ?? ""}|${shapeKey}`;
  let fmt = formatterCache.get(cacheKey);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, timeZone ? { timeZone, ...options } : options);
    formatterCache.set(cacheKey, fmt);
  }
  return fmt;
}

function toDate(dateStr: string): Date {
  return new Date(dateStr);
}

// en-CA, not the user locale: this is a sortable YYYY-MM-DD comparison key, never displayed.
function ymd(date: Date, timeZone: string): string {
  return getFormatter("en-CA", timeZone, "ymd", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isToday(date: Date, timeZone: string): boolean {
  return ymd(date, timeZone) === ymd(new Date(), timeZone);
}

function isYesterday(date: Date, timeZone: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return ymd(date, timeZone) === ymd(yesterday, timeZone);
}

function formatTime(date: Date, timeZone: string): string {
  return getFormatter(i18n.language, timeZone, "time", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatMessageTime(dateStr: string, timeZone: string): string {
  const date = toDate(dateStr);
  if (isToday(date, timeZone)) return formatTime(date, timeZone);
  if (isYesterday(date, timeZone)) {
    return `${i18n.t("channel:yesterday")} ${formatTime(date, timeZone)}`;
  }
  const datePart = getFormatter(i18n.language, timeZone, "monthDay", {
    month: "short",
    day: "numeric",
  }).format(date);
  return `${datePart}, ${formatTime(date, timeZone)}`;
}

export function formatTimeOnly(dateStr: string, timeZone: string): string {
  return formatTime(toDate(dateStr), timeZone);
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return getFormatter(i18n.language, undefined, "shortDate", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatMessageTooltip(dateStr: string, timeZone: string): string {
  return getFormatter(i18n.language, timeZone, "tooltip", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(toDate(dateStr));
}
