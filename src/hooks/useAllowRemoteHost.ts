import { useCallback } from "react";
import { getAccessToken } from "@/api/tokenStore";
import { useUpdateUserPreference } from "@/queries/userPreferencesQueries";
import { addRemoteContentHost } from "@/utils/remoteContent";

export function useAllowRemoteHost(): (domain: string) => void {
  const updatePreference = useUpdateUserPreference();
  return useCallback(
    (domain: string) => {
      const hosts = addRemoteContentHost(domain);
      if (getAccessToken()) updatePreference.mutate({ remoteContentHosts: hosts });
    },
    [updatePreference],
  );
}
