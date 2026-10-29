import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useE2ee } from "@/e2ee/e2eeContextValue";
import { knownPlainMessages } from "@/e2ee/admission";
import { useUpdateUserPreference } from "@/queries/userPreferencesQueries";

export function useLocalPlainDmRefusal(): boolean {
  return useE2ee().securitySnapshot?.refusal.on === true;
}

export function useSetPlainDmRefusal() {
  const queryClient = useQueryClient();
  const { security } = useE2ee();
  const update = useUpdateUserPreference();
  return useMutation({
    mutationFn: async (on: boolean) => {
      if (security !== null) {
        if (on) await security.turnRefusalOn(knownPlainMessages(queryClient));
        else await security.turnRefusalOff();
      }
      return update.mutateAsync({ refusePlainDms: on });
    },
  });
}
