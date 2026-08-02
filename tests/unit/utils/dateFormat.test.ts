import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import i18n from "@/i18n";
import { formatMessageTime, formatMessageTooltip, formatShortDate } from "@/utils/dateFormat";

const TZ = "Europe/Paris";

describe("formatMessageTime", () => {
  beforeEach(() => {
    // Fix "now" to 2026-03-05T14:00:00Z (15:00 Paris time)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T14:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns only time when the date is today", () => {
    const result = formatMessageTime("2026-03-05T08:30:00Z", TZ);
    expect(result).toBe("09:30"); // UTC+1 in March (CET)
  });

  it("prefixes 'Yesterday' for yesterday's date", () => {
    const result = formatMessageTime("2026-03-04T10:00:00Z", TZ);
    expect(result).toMatch(/^Yesterday /);
  });

  it("uses short month+day format for older dates", () => {
    const result = formatMessageTime("2026-01-15T10:00:00Z", TZ);
    expect(result).toMatch(/^Jan 15,/);
  });

  it("includes correct time for older dates", () => {
    const result = formatMessageTime("2026-01-15T13:00:00Z", TZ);
    expect(result).toContain("14:00");
  });
});

describe("locale handling", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders month names in the active language", async () => {
    await i18n.changeLanguage("pl");
    const result = formatMessageTime("2026-01-15T10:00:00Z", TZ);
    expect(result).toContain("sty");
    expect(result).not.toContain("Jan");
  });

  it("localises formatShortDate", async () => {
    await i18n.changeLanguage("pl");
    expect(formatShortDate("2026-01-15T10:00:00Z")).toContain("sty");
  });

  it("keeps a 24-hour clock in every locale", async () => {
    await i18n.changeLanguage("en");
    expect(formatMessageTime("2026-01-15T13:00:00Z", TZ)).toContain("14:00");
    await i18n.changeLanguage("pl");
    expect(formatMessageTime("2026-01-15T13:00:00Z", TZ)).toContain("14:00");
  });
});

describe("formatMessageTooltip", () => {
  it("returns a full timestamp string", () => {
    const result = formatMessageTooltip("2026-03-05T14:30:45Z", "UTC");
    expect(result).toContain("2026");
    expect(result).toContain("Mar");
    expect(result).toContain("5");
  });

  it("includes seconds", () => {
    const result = formatMessageTooltip("2026-03-05T14:30:45Z", "UTC");
    // The locale may output "02:30:45 PM" or "14:30:45" depending on the locale
    expect(result).toMatch(/:\d{2}(:\d{2})?(\s*(AM|PM))?/);
    // Verify seconds (45) appear in the output
    expect(result).toContain("45");
  });
});
