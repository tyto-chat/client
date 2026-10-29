import { useEffect, useRef } from "react";
import { useServerInfo } from "@/hooks/useServerInfo";
import { useLocalPlainDmRefusal } from "@/queries/plainDmRefusalQueries";
import { useUpdateUserPreference, useUserPreferences } from "@/queries/userPreferencesQueries";

export function PlainDmRefusalMirror() {
  const localOn = useLocalPlainDmRefusal();
  const mode = useServerInfo()?.encryptedDmsMode;
  const { data: prefs } = useUserPreferences({ enabled: localOn && mode !== undefined });
  const update = useUpdateUserPreference();
  const mirrored = useRef(false);

  useEffect(() => {
    if (!localOn) {
      mirrored.current = false;
      return;
    }
    if (mirrored.current || prefs === undefined || prefs.refusePlainDms === true) return;
    mirrored.current = true;
    update.mutate({ refusePlainDms: true });
  }, [localOn, prefs, update]);

  return null;
}
