import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { TEST_BASE_URL as BASE, mockUser } from "../fixtures";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { __setRequestTimeoutsForTests } from "@/api/fetchWithDeadline";
import { encryptFile, uploadedAttachmentsFor } from "@/e2ee/attachments";
import type { ConversationSession } from "@/e2ee/conversationSession";
import { usePendingAttachments } from "@/hooks/usePendingAttachments";
import { MessageAttachments } from "@/components/chat/MessageAttachments";
import { useSendConversationMessage } from "@/queries/conversationQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { Attachment, Conversation, Message } from "@/types/api";

const notify = vi.fn();
vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const refreshAccessToken = vi.hoisted(() => vi.fn());
vi.mock("@/api/auth", () => ({ refreshAccessToken }));

const IDENT = "secret-c";
let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  notify.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.conversation(IDENT), {
    id: 70,
    identifier: IDENT,
    encrypted: true,
    readOnly: false,
    readOnlyReason: null,
    members: [{ userId: mockUser.id }, { userId: 2 }],
  } as unknown as Conversation);
  let n = 0;
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:${BASE}/${(n += 1)}`),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __setRequestTimeoutsForTests(null);
});

async function encryptedAttachment(content: string, name: string, mimeType: string) {
  const encrypted = await encryptFile(new File([content], name, { type: mimeType }));
  const contentUrl = `${BASE}/media/tok/${name}.bin`;
  server.use(http.get(contentUrl, () => new HttpResponse(encrypted.blob)));
  return {
    "@id": `/api/v1/attachments/${name}`,
    "@type": "MediaObject",
    contentUrl,
    thumbnailUrl: null,
    originalName: name,
    mimeType,
    size: content.length,
    width: null,
    height: null,
    e2ee: { key: encrypted.key, nonce: encrypted.nonce },
  } satisfies Attachment;
}

describe("encrypted attachments in the UI", () => {
  it("uploads ciphertext to the encrypted endpoint and keeps the key for sending", async () => {
    const plain = vi.fn(() => HttpResponse.json({}, { status: 201 }));
    let uploadedName = "";
    server.use(
      http.post(`${BASE}/api/v1/conversations/${IDENT}/attachments`, plain),
      http.post(
        `${BASE}/api/v1/conversations/${IDENT}/encrypted-attachments`,
        async ({ request }) => {
          uploadedName = ((await request.formData()).get("file") as File).name;
          return HttpResponse.json({ "@id": "/api/v1/attachments/5" }, { status: 201 });
        },
      ),
    );
    const { result } = renderHook(() => usePendingAttachments({ conversationIdentifier: IDENT }), {
      wrapper,
    });

    await act(() =>
      result.current.handleFiles([
        new File(["hello"], "plan.txt", { type: "text/plain" }),
      ] as unknown as FileList),
    );

    expect(plain).not.toHaveBeenCalled();
    expect(uploadedName).toMatch(/\.bin$/);
    expect(result.current.pendingAttachments[0]?.iri).toBe("/api/v1/attachments/5");
    expect(uploadedAttachmentsFor(["/api/v1/attachments/5"])[0]?.manifest.name).toBe("plan.txt");
  });

  it("sends the uploaded keys inside the encrypted message and then forgets them", async () => {
    server.use(
      http.post(`${BASE}/api/v1/conversations/${IDENT}/encrypted-attachments`, () =>
        HttpResponse.json({ "@id": "/api/v1/attachments/6" }, { status: 201 }),
      ),
    );
    const pending = renderHook(() => usePendingAttachments({ conversationIdentifier: IDENT }), {
      wrapper,
    });
    await act(() =>
      pending.result.current.handleFiles([
        new File(["x"], "x.txt", { type: "text/plain" }),
      ] as unknown as FileList),
    );
    const send = vi.fn(() => Promise.resolve({ "@id": "/api/v1/messages/m" } as Message));
    const session = { send } as unknown as ConversationSession;
    const { result } = renderHook(
      () => useSendConversationMessage(IDENT, mockUser, undefined, session),
      { wrapper },
    );

    await result.current.mutateAsync({ text: "here", attachmentIris: ["/api/v1/attachments/6"] });

    expect(send).toHaveBeenCalledWith("here", undefined, [
      expect.objectContaining({ iri: "/api/v1/attachments/6", id: "6" }),
    ]);
    expect(() => uploadedAttachmentsFor(["/api/v1/attachments/6"])).toThrow();
  });

  it("shows an encrypted image from a decrypted local URL", async () => {
    const attachment = await encryptedAttachment("png-bytes", "photo.png", "image/png");

    render(
      <MessageAttachments
        attachments={[attachment]}
        canDelete={false}
        onDeleteAttachment={vi.fn()}
      />,
      {
        wrapper,
      },
    );

    await waitFor(() =>
      expect(
        screen.getAllByRole("img").some((img) => img.getAttribute("src")?.startsWith("blob:")),
      ).toBe(true),
    );
    expect(document.body.innerHTML).not.toContain("/media/tok/");
  });

  it("decrypts a file only when it is downloaded", async () => {
    const encrypted = await encryptFile(new File(["report body"], "report.pdf"));
    const attachment = await encryptedAttachment("unused", "report.pdf", "application/pdf");
    attachment.e2ee = { key: encrypted.key, nonce: encrypted.nonce };
    let fetched = 0;
    server.use(
      http.get(attachment.contentUrl, () => {
        fetched += 1;
        return new HttpResponse(encrypted.blob);
      }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <MessageAttachments
        attachments={[attachment]}
        canDelete={false}
        onDeleteAttachment={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(fetched).toBe(0);

    await userEvent.click(screen.getByTitle("download_attachment"));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(fetched).toBe(1);
    const created = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(await (created.at(-1)?.[0] as Blob).text()).toBe("report body");
    expect(notify).not.toHaveBeenCalled();
  });

  it("reports an attachment that fails to decrypt", async () => {
    const attachment = await encryptedAttachment("original", "a.pdf", "application/pdf");
    const other = await encryptFile(new File(["swapped"], "b"));
    server.use(http.get(attachment.contentUrl, () => new HttpResponse(other.blob)));

    render(
      <MessageAttachments
        attachments={[attachment]}
        canDelete={false}
        onDeleteAttachment={vi.fn()}
      />,
      {
        wrapper,
      },
    );
    await userEvent.click(screen.getByTitle("download_attachment"));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("conversation:e2ee_attachment_unreadable", "error"),
    );
  });

  it("never sends the login token to another origin", async () => {
    const attachment = await encryptedAttachment("x", "leak.pdf", "application/pdf");
    attachment.contentUrl = "https://elsewhere.example/media/tok/leak.pdf.bin";
    const foreign = vi.fn(() => new HttpResponse(new Blob(["x"])));
    server.use(http.get(attachment.contentUrl, foreign));

    render(
      <MessageAttachments
        attachments={[attachment]}
        canDelete={false}
        onDeleteAttachment={vi.fn()}
      />,
      { wrapper },
    );
    await userEvent.click(screen.getByTitle("download_attachment"));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("conversation:e2ee_attachment_unreadable", "error"),
    );
    expect(foreign).not.toHaveBeenCalled();
  });

  it("keeps a failed encrypted audio attachment visible with a retry", async () => {
    const attachment = await encryptedAttachment("x", "voice.mp3", "audio/mpeg");
    server.use(http.get(attachment.contentUrl, () => new HttpResponse(null, { status: 404 })));

    render(
      <MessageAttachments
        attachments={[attachment]}
        canDelete={false}
        onDeleteAttachment={vi.fn()}
      />,
      { wrapper },
    );

    await waitFor(() => expect(client.isFetching()).toBe(0), { timeout: 5000 });
    expect(screen.getByText("voice.mp3")).toBeInTheDocument();
    expect(screen.getByTitle("download_attachment")).toBeInTheDocument();
  });

  it("never reuses a preview decrypted under another key", async () => {
    const first = await encryptedAttachment("first", "same.png", "image/png");
    const view = render(
      <MessageAttachments attachments={[first]} canDelete={false} onDeleteAttachment={vi.fn()} />,
      { wrapper },
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    view.unmount();
    const forged = await encryptFile(new File(["forged"], "same.png"));
    let fetched = 0;
    server.use(
      http.get(first.contentUrl, () => {
        fetched += 1;
        return new HttpResponse(forged.blob);
      }),
    );
    const second = {
      ...first,
      e2ee: { key: crypto.getRandomValues(new Uint8Array(32)), nonce: forged.nonce },
    };

    render(
      <MessageAttachments attachments={[second]} canDelete={false} onDeleteAttachment={vi.fn()} />,
      { wrapper },
    );

    await waitFor(() => expect(fetched).toBe(1));
  });

  it("decrypts only small images automatically", async () => {
    const big = await encryptedAttachment("x", "huge.png", "image/png");
    big.size = 11 * 1024 * 1024;
    const video = await encryptedAttachment("x", "clip.mp4", "video/mp4");
    let fetched = 0;
    server.use(
      http.get(big.contentUrl, () => {
        fetched += 1;
        return new HttpResponse(null, { status: 500 });
      }),
      http.get(video.contentUrl, () => {
        fetched += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    render(
      <MessageAttachments
        attachments={[big, video]}
        canDelete={false}
        onDeleteAttachment={vi.fn()}
      />,
      { wrapper },
    );

    expect(screen.getByText("huge.png")).toBeInTheDocument();
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetched).toBe(0);
  });

  it("refuses an automatic preview whose ciphertext is larger than the limit", async () => {
    const small = await encryptedAttachment("x", "tiny.png", "image/png");
    const oversized = await encryptFile(new File([new Uint8Array(11 * 1024 * 1024)], "tiny.png"));
    small.e2ee = { key: oversized.key, nonce: oversized.nonce };
    server.use(http.get(small.contentUrl, () => new HttpResponse(oversized.blob)));

    render(
      <MessageAttachments attachments={[small]} canDelete={false} onDeleteAttachment={vi.fn()} />,
      { wrapper },
    );

    await waitFor(() => expect(client.isFetching()).toBe(0), { timeout: 5000 });
    expect(
      screen.queryAllByRole("img").some((img) => img.getAttribute("src")?.startsWith("blob:")),
    ).toBe(false);
  });

  it("refreshes an expired login once before downloading", async () => {
    const encrypted = await encryptFile(new File(["fresh"], "f.pdf"));
    const attachment = await encryptedAttachment("unused", "f.pdf", "application/pdf");
    attachment.e2ee = { key: encrypted.key, nonce: encrypted.nonce };
    refreshAccessToken.mockImplementation(async () => setAccessToken("renewed"));
    server.use(
      http.get(attachment.contentUrl, ({ request }) =>
        request.headers.get("Authorization") === "Bearer renewed"
          ? new HttpResponse(encrypted.blob)
          : new HttpResponse(null, { status: 401 }),
      ),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <MessageAttachments
        attachments={[attachment]}
        canDelete={false}
        onDeleteAttachment={vi.fn()}
      />,
      { wrapper },
    );
    await userEvent.click(screen.getByTitle("download_attachment"));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("never retries with a token from a server switched to meanwhile", async () => {
    const attachment = await encryptedAttachment("x", "g.pdf", "application/pdf");
    const authorizations: (string | null)[] = [];
    refreshAccessToken.mockImplementation(async () => {
      configureApiClient("https://other.example");
      setAccessToken("other-server-token");
    });
    server.use(
      http.get(attachment.contentUrl, ({ request }) => {
        authorizations.push(request.headers.get("Authorization"));
        return new HttpResponse(null, { status: 401 });
      }),
    );

    render(
      <MessageAttachments
        attachments={[attachment]}
        canDelete={false}
        onDeleteAttachment={vi.fn()}
      />,
      { wrapper },
    );
    await userEvent.click(screen.getByTitle("download_attachment"));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("conversation:e2ee_attachment_unreadable", "error"),
    );
    expect(authorizations).toEqual(["Bearer jwt"]);
  });

  it("stops a download larger than the manifest says", async () => {
    const attachment = await encryptedAttachment("tiny", "t.pdf", "application/pdf");
    const flood = await encryptFile(new File([new Uint8Array(200_000)], "t.pdf"));
    attachment.e2ee = { key: flood.key, nonce: flood.nonce };
    server.use(http.get(attachment.contentUrl, () => new HttpResponse(flood.blob)));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <MessageAttachments
        attachments={[attachment]}
        canDelete={false}
        onDeleteAttachment={vi.fn()}
      />,
      { wrapper },
    );
    await userEvent.click(screen.getByTitle("download_attachment"));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("conversation:e2ee_attachment_unreadable", "error"),
    );
    expect(click).not.toHaveBeenCalled();
  });

  it("gives up on a download that stalls", async () => {
    __setRequestTimeoutsForTests({ request: 50 });
    const attachment = await encryptedAttachment("x", "s.pdf", "application/pdf");
    server.use(http.get(attachment.contentUrl, () => new Promise<Response>(() => undefined)));

    render(
      <MessageAttachments
        attachments={[attachment]}
        canDelete={false}
        onDeleteAttachment={vi.fn()}
      />,
      { wrapper },
    );
    await userEvent.click(screen.getByTitle("download_attachment"));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("conversation:e2ee_attachment_unreadable", "error"),
    );
  });
});
