import { useMemo } from "react";
import { useQueries, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getBaseUrl } from "@/api/client";
import { RequestDeadlineError, requestTimeoutMs } from "@/api/fetchWithDeadline";
import { getAccessToken } from "@/api/tokenStore";
import { decryptFile } from "@/e2ee/attachments";
import { toBase64Url } from "@/e2ee/envelope";
import { isImageMime } from "@/utils/attachmentFormat";
import type { Attachment } from "@/types/api";

const QUERY_ROOT = "e2eeAttachment";
const AUTO_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
const CIPHERTEXT_OVERHEAD_BYTES = 1024;
const watched = new WeakSet<QueryClient>();

function revokeOnRemoval(queryClient: QueryClient): void {
  if (watched.has(queryClient)) return;
  watched.add(queryClient);
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "removed" || event.query.queryKey[0] !== QUERY_ROOT) return;
    const url = event.query.state.data;
    if (typeof url === "string") URL.revokeObjectURL(url);
  });
}

function keyTag(attachment: Attachment): string {
  const { key, nonce } = attachment.e2ee ?? { key: new Uint8Array(), nonce: new Uint8Array() };
  return toBase64Url(key) + "." + toBase64Url(nonce);
}

function isAutoPreview(attachment: Attachment): boolean {
  return (
    attachment.e2ee !== undefined &&
    isImageMime(attachment.mimeType) &&
    (attachment.size ?? Infinity) <= AUTO_PREVIEW_MAX_BYTES
  );
}

function stallGuard(idleMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const kick = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new RequestDeadlineError()), idleMs);
  };
  kick();
  return { signal: controller.signal, kick, stop: () => clearTimeout(timer) };
}

async function readLimited(response: Response, maxBytes: number, kick: () => void): Promise<Blob> {
  const tooLarge = () => new Error("the attachment is too large to preview");
  if (Number(response.headers.get("Content-Length") ?? 0) > maxBytes) throw tooLarge();
  if (response.body === null) return new Blob();
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    kick();
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return new Blob(chunks);
}

export async function decryptAttachment(
  attachment: Attachment,
  maxCiphertextBytes = Infinity,
): Promise<Blob> {
  if (attachment.e2ee === undefined || attachment.contentUrl === null) {
    throw new Error("not an encrypted attachment");
  }
  const url = attachment.contentUrl;
  const origin = new URL(url).origin;
  const guard = stallGuard(requestTimeoutMs());
  const download = () => {
    if (origin !== new URL(getBaseUrl()).origin) {
      throw new Error("the attachment is not on this server");
    }
    const token = getAccessToken();
    return fetch(url, {
      credentials: "include",
      signal: guard.signal,
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    });
  };
  try {
    let response = await download();
    if (response.status === 401 && getAccessToken() !== null) {
      const { refreshAccessToken } = await import("@/api/auth");
      await refreshAccessToken();
      guard.kick();
      response = await download();
    }
    if (!response.ok) throw new Error(`attachment download failed: ${response.status}`);
    const ciphertext = await readLimited(
      response,
      Math.min(maxCiphertextBytes, (attachment.size ?? 0) + CIPHERTEXT_OVERHEAD_BYTES),
      guard.kick,
    );
    guard.stop();
    const plain = await decryptFile(ciphertext, attachment.e2ee.key, attachment.e2ee.nonce);
    return new Blob([plain], { type: attachment.mimeType ?? "application/octet-stream" });
  } finally {
    guard.stop();
  }
}

export async function downloadEncryptedAttachment(attachment: Attachment): Promise<void> {
  const url = URL.createObjectURL(await decryptAttachment(attachment));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.originalName ?? "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function useDecryptedAttachments(attachments: readonly Attachment[]): Attachment[] {
  const queryClient = useQueryClient();
  revokeOnRemoval(queryClient);
  const media = attachments.filter(isAutoPreview);
  const results = useQueries({
    queries: media.map((attachment) => ({
      queryKey: [QUERY_ROOT, attachment["@id"], keyTag(attachment)],
      queryFn: async () =>
        URL.createObjectURL(
          await decryptAttachment(attachment, AUTO_PREVIEW_MAX_BYTES + CIPHERTEXT_OVERHEAD_BYTES),
        ),
      staleTime: Infinity,
      gcTime: 2 * 60_000,
      retry: 1,
    })),
  });
  const urls = new Map(media.map((a, i) => [a["@id"], results[i]?.data]));
  const signature = media.map((a, i) => `${a["@id"]}:${results[i]?.dataUpdatedAt ?? 0}`).join();
  return useMemo(
    () =>
      attachments.map((attachment) =>
        attachment.e2ee === undefined
          ? attachment
          : { ...attachment, contentUrl: urls.get(attachment["@id"]) ?? null, thumbnailUrl: null },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attachments, signature],
  );
}
