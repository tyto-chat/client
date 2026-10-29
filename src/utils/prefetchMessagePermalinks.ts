import type { QueryClient } from "@tanstack/react-query";
import { fetchMessageIn } from "@/api/linkedMessages";
import { queryKeys } from "@/queries/queryKeys";
import { StaleTime } from "@/queries/staleTimes";
import type { Message } from "@/types/api";
import { extractPermalinkTargets } from "@/utils/extractPermalinkTargets";
import { linkScope, linkViewer } from "@/utils/linkScope";
import { ENVELOPE_PREFIX } from "@/e2ee/envelope";

export async function prefetchMessagePermalinks(
  queryClient: QueryClient,
  messages: readonly Message[],
  waitAtMostMs?: number,
): Promise<void> {
  const jobs = new Map<string, Promise<void>>();
  for (const message of messages) {
    if (message.text?.startsWith(ENVELOPE_PREFIX) === true) continue;
    for (const target of extractPermalinkTargets(message.text)) {
      const scope = linkScope(target.origin);
      if (!scope) continue;
      const queryKey =
        scope.kind === "foreign"
          ? queryKeys.foreignMessage(target.origin, linkViewer(scope), target.uuid)
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
            retry: false,
            meta: { noGlobalRedirect: true },
          })
          .catch(() => {}),
      );
    }
  }
  const all = Promise.all(jobs.values()).then(() => undefined);
  if (waitAtMostMs === undefined || jobs.size === 0) return all;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, waitAtMostMs);
  });
  await Promise.race([all, budget]);
  clearTimeout(timer);
}

export const PERMALINK_LOADER_WAIT_MS = 300;
