import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { isServerUnreachable, subscribeReachability } from "@/api/reachability";
import { reloadCurrentLocation } from "@/utils/reloadCurrentLocation";
import { RecoveryCard } from "./RouteRecoveryScreen";

const UNREACHABLE = new TypeError("Failed to fetch");

export function ServerUnreachableOverlay() {
  const unreachable = useSyncExternalStore(subscribeReachability, isServerUnreachable);
  const queryClient = useQueryClient();
  const router = useRouter();

  if (!unreachable) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-canvas p-6"
      data-testid="server-unreachable"
    >
      <RecoveryCard
        error={UNREACHABLE}
        onReachable={() => {
          void queryClient.invalidateQueries();
          return reloadCurrentLocation(router);
        }}
      />
    </div>
  );
}
