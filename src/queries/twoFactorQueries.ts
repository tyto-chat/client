import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchTwoFactorStatus,
  setupTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
  regenerateRecoveryCodes,
  type TwoFactorStatus,
  type TwoFactorSetup,
  type RecoveryCodes,
} from "@/api/twoFactor";
import { queryKeys } from "./queryKeys";
import { StaleTime } from "./staleTimes";

export function useTwoFactorStatus(enabled = true) {
  return useQuery<TwoFactorStatus>({
    queryKey: queryKeys.twoFactor(),
    queryFn: fetchTwoFactorStatus,
    enabled,
    staleTime: StaleTime.short,
  });
}

export function useSetupTwoFactor() {
  return useQuery<TwoFactorSetup>({
    queryKey: [...queryKeys.twoFactor(), "setup"],
    queryFn: setupTwoFactor,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useConfirmTwoFactor() {
  const qc = useQueryClient();
  return useMutation<RecoveryCodes, Error, string>({
    mutationFn: confirmTwoFactor,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.twoFactor() });
    },
  });
}

export function useDisableTwoFactor() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: disableTwoFactor,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.twoFactor() });
    },
  });
}

export function useRegenerateRecoveryCodes() {
  const qc = useQueryClient();
  return useMutation<RecoveryCodes, Error, string>({
    mutationFn: regenerateRecoveryCodes,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.twoFactor() });
    },
  });
}
