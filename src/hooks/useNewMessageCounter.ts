import { useCallback, useEffect, useRef, useState } from "react";

export function useNewMessageCounter(hasNextPage: boolean) {
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [scrollToBottomTrigger, setScrollToBottomTrigger] = useState(0);
  const hasNextPageRef = useRef(false);

  useEffect(() => {
    hasNextPageRef.current = hasNextPage;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasNextPage) setNewMessagesCount(0);
  }, [hasNextPage]);

  const isLatestLoaded = useCallback(() => !hasNextPageRef.current, []);
  const bumpNewMessagesCount = useCallback(() => setNewMessagesCount((c) => c + 1), []);
  const resetNewMessagesCount = useCallback(() => setNewMessagesCount(0), []);
  const triggerScrollToBottom = useCallback(() => setScrollToBottomTrigger((v) => v + 1), []);

  return {
    newMessagesCount,
    scrollToBottomTrigger,
    hasNextPageRef,
    isLatestLoaded,
    bumpNewMessagesCount,
    resetNewMessagesCount,
    triggerScrollToBottom,
  };
}
