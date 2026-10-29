import type { RemoteContentPolicy } from "@/utils/remoteContent";
import type { Conversation } from "@/types/api";

export type ContentRenderPolicy = "plain" | "encrypted";

export function renderPolicyFor(
  conversation: Pick<Conversation, "encrypted"> | null | undefined,
): ContentRenderPolicy {
  return conversation?.encrypted === true ? "encrypted" : "plain";
}

const LOCAL_SCHEMES = new Set(["data:", "blob:"]);

export const ENCRYPTED_REMOTE_POLICY: RemoteContentPolicy = {
  version: -1,
  canAutoLoad(url: string) {
    try {
      return LOCAL_SCHEMES.has(new URL(url, window.location.origin).protocol);
    } catch {
      return false;
    }
  },
};
