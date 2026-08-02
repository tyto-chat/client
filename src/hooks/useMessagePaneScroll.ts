import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Message } from "@/types/api";

export function useMessagePaneScroll({
  messages,
  hasPreviousPage,
  isFetchingPreviousPage,
  fetchPreviousPage,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  focusMessageId,
  onFocusComplete,
  scrollToBottomTrigger,
  onAtBottom,
  reclaim,
}: {
  messages: Message[];
  hasPreviousPage: boolean;
  isFetchingPreviousPage: boolean;
  fetchPreviousPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage?: () => void;
  focusMessageId?: string | null;
  onFocusComplete?: () => void;
  scrollToBottomTrigger: number;
  onAtBottom?: () => void;
  reclaim: number;
}) {
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(() => !focusMessageId);
  const isAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const prevLastIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef(0);
  const initialScrollDoneRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(80);
  const bottomReserve = composerHeight - reclaim + 2;
  const focusDoneRef = useRef<string | null>(null);
  const hideScrollbarTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    function showScrollbar() {
      node!.classList.add("scrolling");
      clearTimeout(hideScrollbarTimerRef.current);
    }
    function scheduleHide() {
      hideScrollbarTimerRef.current = setTimeout(() => node!.classList.remove("scrolling"), 1500);
    }
    function onScroll() {
      if (!scrollContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const atBottom = scrollHeight - scrollTop - clientHeight < 50;
      const wasAtBottom = isAtBottomRef.current;
      isAtBottomRef.current = atBottom;
      if (atBottom !== wasAtBottom) setIsAtBottom(atBottom);
      if (atBottom && !wasAtBottom) {
        setHasNewMessages(false);
        onAtBottom?.();
      }
      showScrollbar();
      scheduleHide();
    }
    function onMouseMove(e: MouseEvent) {
      const sbWidth = node!.offsetWidth - node!.clientWidth;
      if (sbWidth <= 0) return;
      const rect = node!.getBoundingClientRect();
      if (e.clientX >= rect.right - sbWidth) {
        showScrollbar();
        clearTimeout(hideScrollbarTimerRef.current);
      }
    }
    function onMouseLeave() {
      scheduleHide();
    }
    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("mousemove", onMouseMove, { passive: true });
    node.addEventListener("mouseleave", onMouseLeave);
    return () => {
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("mousemove", onMouseMove);
      node.removeEventListener("mouseleave", onMouseLeave);
      clearTimeout(hideScrollbarTimerRef.current);
    };
  }, [onAtBottom]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasPreviousPage && !isFetchingPreviousPage) {
          prevScrollHeightRef.current = container.scrollHeight;
          fetchPreviousPage();
        }
      },
      { root: container, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage]);

  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container || !fetchNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: container, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || messages.length === 0 || initialScrollDoneRef.current) return;
    if (focusMessageId) {
      initialScrollDoneRef.current = true;
      isAtBottomRef.current = false;
      return;
    }
    el.scrollTop = el.scrollHeight;
    isAtBottomRef.current = true;
    initialScrollDoneRef.current = true;
  }, [messages, focusMessageId]);

  useEffect(() => {
    if (!focusMessageId || focusDoneRef.current === focusMessageId) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(focusMessageId)}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "auto" });
    target.setAttribute("data-focus", "");
    focusDoneRef.current = focusMessageId;
    const timer = setTimeout(() => {
      target.removeAttribute("data-focus");
      onFocusComplete?.();
    }, 1600);
    return () => clearTimeout(timer);
  }, [focusMessageId, messages, onFocusComplete]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || prevScrollHeightRef.current === 0) return;
    const newScrollHeight = container.scrollHeight;
    if (newScrollHeight !== prevScrollHeightRef.current) {
      container.scrollTop += newScrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    }
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) return;
    const isFirstLoad = prevMessageCountRef.current === 0;
    const lastId = messages[messages.length - 1]?.["@id"] ?? null;
    const hasNew =
      !hasNextPage &&
      messages.length > prevMessageCountRef.current &&
      lastId !== prevLastIdRef.current;
    prevMessageCountRef.current = messages.length;
    prevLastIdRef.current = lastId;
    if (!isFirstLoad && hasNew && !isAtBottomRef.current) {
      startTransition(() => setHasNewMessages(true));
    }
  }, [messages, hasNextPage]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || messages.length === 0 || hasNewMessages || !isAtBottomRef.current) return;
    if (focusMessageId) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, hasNewMessages, focusMessageId]);

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setComposerHeight(el.offsetHeight));
    ro.observe(el);
    setComposerHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (el && isAtBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [composerHeight, bottomReserve]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setHasNewMessages(false);
    onAtBottom?.();
  }, [onAtBottom]);

  const lastScrollTriggerRef = useRef(scrollToBottomTrigger);
  useEffect(() => {
    if (scrollToBottomTrigger === lastScrollTriggerRef.current) return;
    lastScrollTriggerRef.current = scrollToBottomTrigger;
    const el = scrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setHasNewMessages(false);
      onAtBottom?.();
    });
  }, [scrollToBottomTrigger, onAtBottom]);

  return {
    scrollContainerRef,
    topSentinelRef,
    bottomSentinelRef,
    composerRef,
    hasNewMessages,
    isAtBottom,
    scrollToBottom,
    bottomReserve,
    composerHeight,
  };
}
