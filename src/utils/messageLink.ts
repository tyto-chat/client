import { uuidFromIri } from "@/api/hydra";
import { serverOrigin } from "@/utils/permalinkOrigins";

export function messageLinkFromIri(messageIri: string, origin: string = serverOrigin()): string {
  const uuid = uuidFromIri(messageIri);
  return `${origin}/m/${uuid}`;
}

export async function copyMessageLinkToClipboard(
  messageIri: string,
  origin: string = serverOrigin(),
): Promise<boolean> {
  const url = messageLinkFromIri(messageIri, origin);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
