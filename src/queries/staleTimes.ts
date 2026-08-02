export const StaleTime = {
  presence: 25_000,
  short: 30_000,
  medium: 60_000,
  long: 5 * 60 * 1000,
  static: Infinity,
} as const;
