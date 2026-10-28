import { apiClient } from "@/api/client";

export type UserTheme = "system" | "light" | "dark";
export type UserSubmitKey = "enter" | "shift+enter" | "ctrl+enter" | "none";
export type RemoteContentLevel = "custom" | "all";
export type UserLocale = "en" | "pl" | "fr" | "de" | "es" | "it" | "pt" | "uk" | "nl" | "tr";

export interface UserPreferences {
  theme: UserTheme | null;
  submitKey: UserSubmitKey | null;
  locale: UserLocale | null;
  timezone: string | null;
  sendTypingIndicator: boolean | null;
  desktopNotifications: boolean | null;
  convertEmoticons: boolean | null;
  resumeLastLocation: boolean | null;
  sectionCollapse: Record<string, boolean> | null;
  remoteContent: RemoteContentLevel | null;
  remoteContentHosts: string[] | null;
  autoplayGifs: boolean | null;
  refusePlainDms: boolean | null;
  updatedAt: string;
}

export type UserPreferencesPatch = Partial<Omit<UserPreferences, "updatedAt">>;

export const fetchUserPreferences = (): Promise<UserPreferences> =>
  apiClient.get<UserPreferences>("/api/me/preferences");

export const patchUserPreferences = (patch: UserPreferencesPatch): Promise<UserPreferences> =>
  apiClient.patch<UserPreferences>("/api/me/preferences", patch);
