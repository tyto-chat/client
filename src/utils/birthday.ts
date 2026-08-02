interface BirthdayBearer {
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
}

export function isBirthdayToday(profile?: BirthdayBearer | null): boolean {
  if (!profile?.birthdayMonth || !profile?.birthdayDay) return false;
  const now = new Date();
  return now.getMonth() + 1 === profile.birthdayMonth && now.getDate() === profile.birthdayDay;
}

export function formatBirthday(month: number, day: number, locale: string): string {
  return new Date(2000, month - 1, day).toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
  });
}
