import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";

let captured: ((e: MessageEvent) => void) | null = null;
let capturedTopic: string | null = null;
vi.mock("@/hooks/useMercureSubscription", () => ({
  useMercureSubscription: (topic: string | null, onMessage: (e: MessageEvent) => void) => {
    capturedTopic = topic;
    captured = onMessage;
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { useThreadMercure } from "@/hooks/useMercure";
import { queryKeys } from "@/queries/queryKeys";
import type { Message } from "@/types/api";

const ROOT_A = "/api/messages/aaaa";
const ROOT_B = "/api/messages/bbbb";

function fire(payload: unknown) {
  captured?.({ data: JSON.stringify(payload) } as MessageEvent);
}

function reply(iri: string, parent: unknown, userId: number): Message {
  return {
    "@id": iri,
    "@type": "Message",
    parent,
    createdBy: { id: userId },
  } as unknown as Message;
}

describe("useThreadMercure on a shared container thread topic", () => {
  let qc: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);

  beforeEach(() => {
    captured = null;
    qc = new QueryClient();
    renderHook(() => useThreadMercure(ROOT_A, "c/12/t"), { wrapper });
  });

  it("subscribes to the given topic", () => {
    expect(capturedTopic).toBe("c/12/t");
  });

  it("ignores a reply whose parent is another root", () => {
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_A), []);
    fire(reply("/api/messages/r1", ROOT_B, 3));
    expect(qc.getQueryData(queryKeys.threadReplies(ROOT_A))).toEqual([]);
  });

  it("keeps the optimistic row when the same author's echo is for another root", () => {
    const optimistic = reply("optimistic-1", ROOT_A, 7);
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_A), [optimistic]);
    fire(reply("/api/messages/r2", { "@id": ROOT_B }, 7));
    expect(qc.getQueryData(queryKeys.threadReplies(ROOT_A))).toEqual([optimistic]);
  });

  it("replaces the optimistic row with a reply for this root (parent as IRI)", () => {
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_A), [reply("optimistic-1", ROOT_A, 7)]);
    const real = reply("/api/messages/r3", ROOT_A, 7);
    fire(real);
    expect(qc.getQueryData(queryKeys.threadReplies(ROOT_A))).toEqual([real]);
  });

  it("appends a reply for this root (parent as object)", () => {
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_A), []);
    const real = reply("/api/messages/r4", { "@id": ROOT_A }, 5);
    fire(real);
    expect(qc.getQueryData(queryKeys.threadReplies(ROOT_A))).toEqual([real]);
  });

  it("matches the root by uuid when the pushed IRI carries an API version prefix", () => {
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_A), []);
    const real = reply("/api/v1/messages/r5", "/api/v1/messages/aaaa", 5);
    fire(real);
    expect(qc.getQueryData(queryKeys.threadReplies(ROOT_A))).toEqual([real]);
  });

  it("ignores a reply with no parent", () => {
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_A), []);
    fire(reply("/api/messages/r6", null, 5));
    expect(qc.getQueryData(queryKeys.threadReplies(ROOT_A))).toEqual([]);
  });
});
