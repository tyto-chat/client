import type { QueryClient } from "@tanstack/react-query";
import { fetchMessageIn } from "@/api/linkedMessages";
import { queryKeys } from "@/queries/queryKeys";
import { StaleTime } from "@/queries/staleTimes";
import type { Message } from "@/types/api";
import { extractPermalinkTargets } from "@/utils/extractPermalinkTargets";
import { linkScope } from "@/utils/linkScope";

export async function prefetchMessagePermalinks(
  queryClient: QueryClient,
  messages: readonly Message[],
): Promise<void> {
  const jobs = new Map<string, Promise<void>>();
  for (const message of messages) {
    for (const target of extractPermalinkTargets(message.text)) {
      const scope = linkScope(target.origin);
      if (!scope) continue;
      const queryKey =
        scope.kind === "foreign"
          ? queryKeys.foreignMessage(target.origin, target.uuid)
          : queryKeys.message(target.uuid);
      const id = queryKey.join("|");
      if (jobs.has(id)) continue;
      jobs.set(
        id,
        queryClient
          .prefetchQuery({
            queryKey,
            queryFn: () => fetchMessageIn(scope, target.uuid),
            staleTime: StaleTime.long,
            meta: { noGlobalRedirect: true },
          })
          .catch(() => {}),
      );
    }
  }
  await Promise.all(jobs.values());
}
