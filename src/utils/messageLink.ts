import { uuidFromIri } from "@/api/hydra";
export function messageLinkFromIri(
  messageIri: string,
  origin: string = window.location.origin,
): string {
  const uuid = uuidFromIri(messageIri);
  return `${origin}/m/${uuid}`;
}

export async function copyMessageLinkToClipboard(
  messageIri: string,
  origin: string = window.location.origin,
): Promise<boolean> {
  const url = messageLinkFromIri(messageIri, origin);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
