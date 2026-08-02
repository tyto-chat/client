export interface MercureHandlers {
  onReconnect?: () => void;
  onStaleToken?: () => void;
  onSustainedFailure?: () => void;
}

export function subscribeMercure(
  topics: string[],
  onMessage: (event: MessageEvent) => void,
  mercureToken: string | null | undefined,
  handlers: MercureHandlers = {},
  hubUrl?: string,
): () => void {
  if (!hubUrl) return () => {};

  const base = new URL(hubUrl);
  for (const topic of topics) {
    base.searchParams.append("topic", topic);
  }
  if (mercureToken) {
    base.searchParams.set("authorization", mercureToken);
  }
  const url = base.toString();

  let eventSource: EventSource | null = null;
  let closed = false;
  let everOpened = false;
  let errorCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let notifiedFailure = false;

  const connect = () => {
    if (closed) return;
    const es = new EventSource(url);
    eventSource = es;

    es.onopen = () => {
      const recovered = errorCount > 0;
      errorCount = 0;
      notifiedFailure = false;
      if (everOpened && recovered) handlers.onReconnect?.();
      everOpened = true;
    };

    es.onmessage = onMessage;

    es.onerror = () => {
      if (closed) return;
      errorCount += 1;
      es.close();
      if (errorCount % 4 === 0) handlers.onStaleToken?.();
      if (errorCount >= 5 && !notifiedFailure) {
        notifiedFailure = true;
        handlers.onSustainedFailure?.();
      }
      const delay = Math.min(1000 * 2 ** Math.min(errorCount - 1, 5), 30000);
      retryTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    eventSource?.close();
  };
}
