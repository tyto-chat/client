import { useEffect, useRef } from "react";
import { useUserPreferences, useUpdateUserPreference } from "@/queries/userPreferencesQueries";
import type { UserPreferences, UserPreferencesPatch } from "@/api/userPreferences";
import { isDeviceScopedPref } from "@/platform/deviceScopedPreferences";

export function usePreferenceSync<K extends keyof Omit<UserPreferences, "updatedAt">>(
  key: K,
  apply: (value: NonNullable<UserPreferences[K]>) => void,
) {
  const detached = isDeviceScopedPref(key);
  const { data, isSuccess } = useUserPreferences({ enabled: !detached });
  const lastAppliedRef = useRef<UserPreferences[K] | null | undefined>(undefined);

  useEffect(() => {
    if (detached) return;
    if (!isSuccess || !data) return;
    const next = data[key];
    if (next === null || next === undefined) return;
    if (next === lastAppliedRef.current) return;
    lastAppliedRef.current = next;
    apply(next as NonNullable<UserPreferences[K]>);
  }, [detached, isSuccess, data, key, apply]);

  const update = useUpdateUserPreference();
  const writeToServer = (value: UserPreferences[K] | null) => {
    if (detached) return;
    if (!data && !isSuccess) return;
    lastAppliedRef.current = value;
    update.mutate({ [key]: value } as UserPreferencesPatch);
  };

  return { writeToServer };
}
