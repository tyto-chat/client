import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelAccountDeletion,
  fetchAccountDeletionStatus,
  requestAccountDeletion,
  type AccountDeletionStatus,
} from "@/api/accountDeletion";
import { queryKeys } from "@/queries/queryKeys";

export function useAccountDeletionStatus(enabled = true) {
  return useQuery<AccountDeletionStatus>({
    queryKey: queryKeys.accountDeletion(),
    queryFn: fetchAccountDeletionStatus,
    enabled,
    staleTime: StaleTime.short,
  });
}

export function useRequestAccountDeletion() {
  const qc = useQueryClient();
  return useMutation<AccountDeletionStatus, Error>({
    mutationFn: requestAccountDeletion,
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.accountDeletion(), data);
    },
  });
}

export function useCancelAccountDeletion() {
  const qc = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: cancelAccountDeletion,
    onSuccess: () => {
      qc.setQueryData<AccountDeletionStatus>(queryKeys.accountDeletion(), { pending: false });
    },
  });
}
