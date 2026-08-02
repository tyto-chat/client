import { fetchServerInfo } from "@/api/serverInfo";
import { resolveServerInfoUrl } from "@/utils/serverInfoUrl";
import { unwrapCollection } from "@/api/hydra";
import type { Community, CommunityEmoji, HydraCollection, Message } from "@/types/api";

const API_PREFIX = "/api/v1";

let _baseUrl = "";

export function configureEmbedApiBase(url: string): void {
  _baseUrl = url.replace(/\/$/, "");
}

export async function bootstrapEmbedApiBase(): Promise<void> {
  const serverInfoUrl = resolveServerInfoUrl();
  if (!serverInfoUrl) return;
  try {
    const origin = new URL(serverInfoUrl).origin;
    const info = await fetchServerInfo(`${origin}${API_PREFIX}/server-info`);
    configureEmbedApiBase(info.apiUrl);
  } catch {
    /* ignore */
  }
}

export type EmbedMessage = Pick<
  Message,
  | "text"
  | "createdBy"
  | "createdAt"
  | "reactions"
  | "replyCount"
  | "communityIdentifier"
  | "channelIdentifier"
  | "attachments"
>;

export interface EmbedData {
  message: EmbedMessage;
  communityName: string;
  emojiByShortcode: Map<string, string>;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(_baseUrl + path, {
      headers: { Accept: "application/ld+json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchEmbedData(uuid: string): Promise<EmbedData | null> {
  const message = await getJson<Message>(`${API_PREFIX}/messages/${uuid}`);
  if (!message) return null;
  if (!message.channelIdentifier || !message.communityIdentifier) return null;

  const [community, emojis] = await Promise.all([
    getJson<Community>(`${API_PREFIX}/communities/${message.communityIdentifier}`),
    getJson<HydraCollection<CommunityEmoji> | CommunityEmoji[]>(
      `${API_PREFIX}/communities/${message.communityIdentifier}/emojis`,
    ),
  ]);

  const emojiByShortcode = new Map<string, string>();
  if (emojis) {
    for (const emoji of unwrapCollection(emojis)) {
      if (emoji.image?.contentUrl) emojiByShortcode.set(emoji.shortcode, emoji.image.contentUrl);
    }
  }

  return {
    message,
    communityName: community?.name ?? message.communityIdentifier,
    emojiByShortcode,
  };
}
