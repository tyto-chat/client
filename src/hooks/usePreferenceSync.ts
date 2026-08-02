import { useEffect, useRef } from "react";
import { useUserPreferences, useUpdateUserPreference } from "@/queries/userPreferencesQueries";
import type { UserPreferences, UserPreferencesPatch } from "@/api/userPreferences";

export function usePreferenceSync<K extends keyof Omit<UserPreferences, "updatedAt">>(
  key: K,
  apply: (value: NonNullable<UserPreferences[K]>) => void,
) {
  const { data, isSuccess } = useUserPreferences();
  const lastAppliedRef = useRef<UserPreferences[K] | null | undefined>(undefined);

  useEffect(() => {
    if (!isSuccess || !data) return;
    const next = data[key];
    if (next === null || next === undefined) return;
    if (next === lastAppliedRef.current) return;
    lastAppliedRef.current = next;
    apply(next as NonNullable<UserPreferences[K]>);
  }, [isSuccess, data, key, apply]);

  const update = useUpdateUserPreference();
  const writeToServer = (value: UserPreferences[K] | null) => {
    if (!data && !isSuccess) return;
    lastAppliedRef.current = value;
    update.mutate({ [key]: value } as UserPreferencesPatch);
  };

  return { writeToServer };
}
