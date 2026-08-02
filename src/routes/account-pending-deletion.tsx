import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountPendingDeletionGate } from "@/components/AccountPendingDeletionGate";
import { fetchAccountDeletionStatus } from "@/api/accountDeletion";
import { queryKeys } from "@/queries/queryKeys";

export const Route = createFileRoute("/account-pending-deletion")({
  loader: async ({ context: { queryClient } }) => {
    const status = await queryClient.ensureQueryData({
      queryKey: queryKeys.accountDeletion(),
      queryFn: fetchAccountDeletionStatus,
    });
    if (!status.pending) {
      throw redirect({ to: "/" });
    }
    return { purgeAt: status.purgeAt };
  },
  component: PendingDeletionRoute,
});

function PendingDeletionRoute() {
  const { purgeAt } = Route.useLoaderData();
  return <AccountPendingDeletionGate purgeAt={purgeAt} />;
}
