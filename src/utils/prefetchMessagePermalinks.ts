import type { QueryClient } from "@tanstack/react-query";
import { fetchMessage } from "@/api/messages";
import { queryKeys } from "@/queries/queryKeys";
import type { Message } from "@/types/api";
import { extractPermalinkUuids } from "@/utils/extractPermalinkUuids";
import { StaleTime } from "@/queries/staleTimes";

export async function prefetchMessagePermalinks(
  queryClient: QueryClient,
  messages: readonly Message[],
): Promise<void> {
  const uuids = new Set<string>();
  for (const msg of messages) {
    for (const u of extractPermalinkUuids(msg.text)) uuids.add(u);
  }
  if (uuids.size === 0) return;
  await Promise.all(
    [...uuids].map((uuid) =>
      queryClient
        .prefetchQuery({
          queryKey: queryKeys.message(uuid),
          queryFn: () => fetchMessage(uuid),
          staleTime: StaleTime.long,
          meta: { noGlobalRedirect: true },
        })
        .catch(() => {}),
    ),
  );
}
