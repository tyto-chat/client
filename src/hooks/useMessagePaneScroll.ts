import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Message } from "@/types/api";

const SETTLE_QUIET_MS = 120;
const SETTLE_MAX_MS = 2500;
const AT_BOTTOM_THRESHOLD_PX = 50;

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
}) {
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(() => !focusMessageId);
  const isAtBottomRef = useRef(!focusMessageId);
  const prevMessageCountRef = useRef(0);
  const prevLastIdRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(80);
  const focusDoneRef = useRef<string | null>(null);
  const hideScrollbarTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [settled, setSettled] = useState(false);
  const lastLayoutShiftRef = useRef(0);
  const fetchingPreviousRef = useRef(false);
  const preserveScrollTopRef = useRef<number | null>(null);

  useEffect(() => {
    fetchingPreviousRef.current = isFetchingPreviousPage;
  }, [isFetchingPreviousPage]);

  useEffect(() => {
    if (!focusMessageId) return;
    isAtBottomRef.current = false;
  }, [focusMessageId]);

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
      const atBottom = Math.abs(scrollContainerRef.current.scrollTop) < AT_BOTTOM_THRESHOLD_PX;
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
          preserveScrollTopRef.current = container.scrollTop;
          fetchPreviousPage();
        }
      },
      { root: container, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || preserveScrollTopRef.current === null) return;
    // At the scroll extreme Chromium pins to the edge through prepends; restoring scrollTop restores the view.
    container.scrollTop = preserveScrollTopRef.current;
    preserveScrollTopRef.current = null;
  }, [messages]);

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

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setComposerHeight(el.offsetHeight));
    ro.observe(el);
    setComposerHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (settled || !content) return;
    const ro = new ResizeObserver(() => {
      lastLayoutShiftRef.current = performance.now();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [settled]);

  useEffect(() => {
    if (settled) return undefined;
    const start = performance.now();
    lastLayoutShiftRef.current = start;
    const interval = setInterval(() => {
      const now = performance.now();
      const imagesPending = contentRef.current
        ? Array.from(contentRef.current.querySelectorAll("img")).some((img) => !img.complete)
        : false;
      if (fetchingPreviousRef.current || imagesPending) {
        lastLayoutShiftRef.current = now;
      }
      if (now - lastLayoutShiftRef.current > SETTLE_QUIET_MS || now - start > SETTLE_MAX_MS) {
        setSettled(true);
      }
    }, 50);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = 0;
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
      el.scrollTo({ top: 0, behavior: "smooth" });
      setIsAtBottom(true);
      setHasNewMessages(false);
      onAtBottom?.();
    });
  }, [scrollToBottomTrigger, onAtBottom]);

  return {
    scrollContainerRef,
    contentRef,
    topSentinelRef,
    bottomSentinelRef,
    composerRef,
    hasNewMessages,
    isAtBottom,
    scrollToBottom,
    composerHeight,
    settled,
  };
}
