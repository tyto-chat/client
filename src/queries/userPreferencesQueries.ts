import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchUserPreferences,
  patchUserPreferences,
  type UserPreferences,
  type UserPreferencesPatch,
} from "@/api/userPreferences";
import { queryKeys } from "@/queries/queryKeys";
import { useHasAccessToken } from "@/api/tokenStore";

export function useUserPreferences() {
  const hasToken = useHasAccessToken();

  return useQuery<UserPreferences>({
    queryKey: queryKeys.userPreferences(),
    queryFn: fetchUserPreferences,
    enabled: hasToken,
    staleTime: StaleTime.medium,
  });
}

export function useUpdateUserPreference() {
  const queryClient = useQueryClient();

  return useMutation<UserPreferences, Error, UserPreferencesPatch, { previous?: UserPreferences }>({
    mutationFn: patchUserPreferences,
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.userPreferences() });
      const previous = queryClient.getQueryData<UserPreferences>(queryKeys.userPreferences());
      if (previous) {
        queryClient.setQueryData<UserPreferences>(queryKeys.userPreferences(), {
          ...previous,
          ...patch,
        });
      }
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.userPreferences(), ctx.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.userPreferences(), data);
    },
  });
}

export function useSectionCollapsed(key: string): boolean {
  const { data } = useUserPreferences();
  const stored = data?.sectionCollapse?.[key];
  if (stored !== undefined) return stored;
  return key.startsWith("hidden:");
}

export function useToggleSectionCollapse() {
  const { data } = useUserPreferences();
  const update = useUpdateUserPreference();
  return (key: string, collapsed: boolean) => {
    const current = data?.sectionCollapse ?? {};
    update.mutate({ sectionCollapse: { ...current, [key]: collapsed } });
  };
}
