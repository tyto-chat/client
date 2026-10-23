import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeMercure } from "@/api/mercure";
import { getFakeEventSourceInstances, getLastFakeEventSource } from "../../mocks/EventSource";

const HUB = "https://mercure.example.com/.well-known/mercure";
const OTHER_HUB = "https://other.example.com/.well-known/mercure";

function open(token: { value: string }, onMessage = vi.fn(), onReconnect = vi.fn()) {
  const sub = subscribeMercure(["c/1"], onMessage, () => token.value, { onReconnect }, HUB);
  const first = getLastFakeEventSource()!;
  first.triggerOpen();
  return { sub, first, onMessage, onReconnect };
}

function lastEventIdOf(es: { url: string }) {
  return new URL(es.url).searchParams.get("lastEventID");
}

function active() {
  return getFakeEventSourceInstances().filter((es) => !es.closed);
}

describe("subscribeMercure", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a no-op handle without a hub url", () => {
    const sub = subscribeMercure(["c/1"], vi.fn(), "t", {}, undefined);
    expect(() => {
      sub.rollover();
      sub.close();
    }).not.toThrow();
    expect(getFakeEventSourceInstances()).toHaveLength(0);
  });

  it("rollover opens a second source with the current token and swaps on open", () => {
    const token = { value: "tok-a" };
    const { sub, first } = open(token);

    token.value = "tok-b";
    sub.rollover();
    const second = getLastFakeEventSource()!;

    expect(second).not.toBe(first);
    expect(second.url).toContain("authorization=tok-b");
    expect(first.closed).toBe(false);

    second.triggerOpen();

    expect(first.closed).toBe(true);
    expect(active()).toEqual([second]);
    sub.close();
  });

  it("delivers each event once when the rollover overlap exceeds the dedup window", () => {
    const token = { value: "tok-a" };
    const { sub, first, onMessage } = open(token);
    sub.rollover();
    const second = getLastFakeEventSource()!;
    const overlap = Array.from({ length: 501 }, (_, i) => `id-${i}`);

    for (const id of overlap) first.dispatch(id, id);
    second.triggerOpen();
    for (const id of overlap) second.dispatch(id, id);
    second.dispatch("new", "id-new");

    const delivered = onMessage.mock.calls.map(([e]) => (e as MessageEvent).data);
    expect(delivered).toEqual([...overlap, "new"]);
    sub.close();
  });

  it("returns to the normal dedup window once the replay has caught up", () => {
    const token = { value: "tok-a" };
    const { sub, first, onMessage } = open(token);
    sub.rollover();
    const second = getLastFakeEventSource()!;
    for (let i = 0; i < 600; i++) first.dispatch(`a${i}`, `a-${i}`);
    second.triggerOpen();
    second.dispatch("fresh", "b-0");
    second.dispatch("again", "a-0");

    expect(onMessage.mock.calls.map(([e]) => (e as MessageEvent).data).slice(-2)).toEqual([
      "fresh",
      "again",
    ]);
    sub.close();
  });

  it("delivers a duplicated id once during the overlap", () => {
    const token = { value: "tok-a" };
    const { sub, first, onMessage } = open(token);
    sub.rollover();
    const second = getLastFakeEventSource()!;

    first.dispatch("a", "id-1");
    second.triggerOpen();
    second.dispatch("a", "id-1");
    second.dispatch("b", "id-2");
    second.dispatch("c");
    second.dispatch("c");

    expect(onMessage.mock.calls.map(([e]) => (e as MessageEvent).data)).toEqual([
      "a",
      "b",
      "c",
      "c",
    ]);
    sub.close();
  });

  it("forgets old ids beyond the bound", () => {
    const token = { value: "tok-a" };
    const { sub, first, onMessage } = open(token);

    first.dispatch("old", "id-0");
    for (let i = 1; i <= 500; i++) first.dispatch("n", `id-${i}`);
    first.dispatch("old", "id-0");

    expect(onMessage).toHaveBeenCalledTimes(502);
    sub.close();
  });

  it("keeps the old source when the rollover errors before opening, without leaking", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const { sub, first } = open(token);
    sub.rollover();
    const second = getLastFakeEventSource()!;

    second.triggerError();

    expect(second.closed).toBe(true);
    expect(first.closed).toBe(false);
    expect(active()).toEqual([first]);

    vi.advanceTimersByTime(5000);
    const retry = getLastFakeEventSource()!;
    expect(retry).not.toBe(second);
    expect(retry).not.toBe(first);
    expect(active()).toEqual([first, retry]);

    retry.triggerOpen();
    expect(active()).toEqual([retry]);

    sub.close();
    expect(active()).toEqual([]);
  });

  it("close() cancels a pending rollover retry", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const { sub } = open(token);
    sub.rollover();
    getLastFakeEventSource()!.triggerError();

    sub.close();
    const count = getFakeEventSourceInstances().length;
    vi.advanceTimersByTime(60000);

    expect(getFakeEventSourceInstances()).toHaveLength(count);
    expect(active()).toEqual([]);
  });

  it("close() closes both sources during an overlap", () => {
    const token = { value: "tok-a" };
    const { sub } = open(token);
    sub.rollover();

    sub.close();

    expect(active()).toEqual([]);
  });

  it("a second rollover replaces a still-pending one", () => {
    const token = { value: "tok-a" };
    const { sub, first } = open(token);
    sub.rollover();
    const second = getLastFakeEventSource()!;
    token.value = "tok-c";
    sub.rollover();
    const third = getLastFakeEventSource()!;

    expect(second.closed).toBe(true);
    expect(active()).toEqual([first, third]);
    third.triggerOpen();
    expect(active()).toEqual([third]);
    sub.close();
  });

  it("does not call onReconnect for a rollover", () => {
    const token = { value: "tok-a" };
    const { sub, onReconnect } = open(token);
    sub.rollover();
    getLastFakeEventSource()!.triggerOpen();

    expect(onReconnect).not.toHaveBeenCalled();
    sub.close();
  });

  it("does not call onReconnect when a rollover recovers from its own error", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const { sub, onReconnect } = open(token);
    sub.rollover();
    getLastFakeEventSource()!.triggerError();
    vi.advanceTimersByTime(5000);
    getLastFakeEventSource()!.triggerOpen();

    expect(onReconnect).not.toHaveBeenCalled();
    sub.close();
  });

  it("calls onReconnect for a rollover after the sleep detector saw a gap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2000-01-01T00:00:00Z"));
    const token = { value: "tok-a" };
    const { sub, onReconnect } = open(token);
    vi.setSystemTime(new Date("2000-01-01T00:10:00Z"));
    vi.advanceTimersByTime(30_000);
    sub.rollover();
    getLastFakeEventSource()!.triggerOpen();

    expect(onReconnect).toHaveBeenCalledOnce();
    sub.close();
  });

  it("calls onReconnect after an error and a reopen", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const { sub, first, onReconnect } = open(token);

    first.triggerError();
    vi.advanceTimersByTime(5000);
    getLastFakeEventSource()!.triggerOpen();

    expect(onReconnect).toHaveBeenCalledOnce();
    sub.close();
  });

  it("keeps the rolled-over source on the error backoff path", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const { sub, onReconnect } = open(token);
    sub.rollover();
    const second = getLastFakeEventSource()!;
    second.triggerOpen();

    second.triggerError();
    vi.advanceTimersByTime(5000);
    const third = getLastFakeEventSource()!;
    expect(third).not.toBe(second);
    third.triggerOpen();

    expect(onReconnect).toHaveBeenCalledOnce();
    expect(active()).toEqual([third]);
    sub.close();
  });
  it("does not resume after an error, so the reconnect refetch is not doubled by a replay", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const { sub, first } = open(token);
    expect(lastEventIdOf(first)).toBeNull();

    first.dispatch("a", "urn:uuid:1");
    first.dispatch("b");
    first.triggerError();
    vi.advanceTimersByTime(5000);

    expect(lastEventIdOf(getLastFakeEventSource()!)).toBeNull();
    sub.close();
  });

  it("resumes the rollover source from the last delivered id", () => {
    const token = { value: "tok-a" };
    const { sub, first } = open(token);
    first.dispatch("a", "urn:uuid:7");

    sub.rollover();

    expect(lastEventIdOf(getLastFakeEventSource()!)).toBe("urn:uuid:7");
    sub.close();
  });

  it("does not resume a rollover that starts while main is erroring", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const { sub, first } = open(token);
    first.dispatch("a", "urn:uuid:7");
    first.triggerError();
    sub.rollover();

    expect(lastEventIdOf(getLastFakeEventSource()!)).toBeNull();
    sub.close();
  });

  it("does not resume a rollover after the device slept", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2000-01-01T00:00:00Z"));
    const token = { value: "tok-a" };
    const { sub, first } = open(token);
    first.dispatch("a", "urn:uuid:7");
    vi.setSystemTime(new Date("2000-01-01T00:10:00Z"));
    sub.rollover();

    expect(lastEventIdOf(getLastFakeEventSource()!)).toBeNull();
    sub.close();
  });

  it("promotes a rollover that opens while main is in error backoff", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const { sub, first, onReconnect } = open(token);
    first.triggerError();
    sub.rollover();
    const pending = getLastFakeEventSource()!;
    pending.triggerOpen();

    expect(onReconnect).toHaveBeenCalledOnce();
    const count = getFakeEventSourceInstances().length;
    vi.advanceTimersByTime(60000);
    expect(getFakeEventSourceInstances()).toHaveLength(count);
    expect(active()).toEqual([pending]);
    sub.close();
  });

  it("leaves one source when main errors during an overlap and both reconnect", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const { sub, first, onReconnect } = open(token);
    sub.rollover();
    const pending = getLastFakeEventSource()!;

    first.triggerError();
    vi.advanceTimersByTime(1000);
    const mainRetry = getLastFakeEventSource()!;
    expect(mainRetry).not.toBe(pending);
    mainRetry.triggerOpen();
    expect(onReconnect).toHaveBeenCalledOnce();

    pending.triggerOpen();

    expect(active()).toEqual([pending]);
    expect(onReconnect).toHaveBeenCalledOnce();
    sub.close();
  });

  it("close() during main backoff with an open pending cancels everything", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const { sub, first } = open(token);
    sub.rollover();
    first.triggerError();

    sub.close();
    const count = getFakeEventSourceInstances().length;
    vi.advanceTimersByTime(60000);

    expect(getFakeEventSourceInstances()).toHaveLength(count);
    expect(active()).toEqual([]);
  });

  it("after repeated rollover failures drops the old stream and reconnects with the current token", () => {
    vi.useFakeTimers();
    const token = { value: "tok-a" };
    const onStaleToken = vi.fn();
    const onReconnect = vi.fn();
    const sub = subscribeMercure(
      ["c/1"],
      vi.fn(),
      () => token.value,
      { onStaleToken, onReconnect },
      HUB,
    );
    const first = getLastFakeEventSource()!;
    first.triggerOpen();
    first.dispatch("a", "urn:uuid:1");
    token.value = "tok-b";
    sub.rollover();

    getLastFakeEventSource()!.triggerError();
    vi.advanceTimersByTime(35000);

    expect(first.closed).toBe(true);
    const replacement = getLastFakeEventSource()!;
    expect(getFakeEventSourceInstances()).toHaveLength(5);
    expect(new URL(replacement.url).searchParams.get("authorization")).toBe("tok-b");
    expect(lastEventIdOf(replacement)).toBeNull();
    replacement.triggerOpen();
    expect(active()).toEqual([replacement]);
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(onStaleToken).not.toHaveBeenCalled();
    sub.close();
  });

  describe("app-wide rollover serialisation", () => {
    function two() {
      const token = { value: "tok-a" };
      const a = subscribeMercure(["c/1"], vi.fn(), () => token.value, {}, HUB);
      const aMain = getLastFakeEventSource()!;
      aMain.triggerOpen();
      const b = subscribeMercure(["c/2"], vi.fn(), () => token.value, {}, HUB);
      const bMain = getLastFakeEventSource()!;
      bMain.triggerOpen();
      return { a, b, aMain, bMain };
    }

    it("opens at most one rollover source at a time", () => {
      const { a, b, aMain, bMain } = two();

      a.rollover();
      b.rollover();

      expect(getFakeEventSourceInstances()).toHaveLength(3);
      const aPending = getLastFakeEventSource()!;
      aPending.triggerOpen();

      expect(getFakeEventSourceInstances()).toHaveLength(4);
      const bPending = getLastFakeEventSource()!;
      expect(bPending.url).toContain("c%2F2");
      bPending.triggerOpen();
      expect(active()).toEqual([aPending, bPending]);
      expect(aMain.closed && bMain.closed).toBe(true);
      a.close();
      b.close();
    });

    it("starts the next rollover when the current subscription closes", () => {
      const { a, b } = two();
      a.rollover();
      b.rollover();

      a.close();

      expect(getFakeEventSourceInstances()).toHaveLength(4);
      expect(getLastFakeEventSource()!.url).toContain("c%2F2");
      b.close();
    });

    it("drops a queued rollover when its subscription closes", () => {
      const { a, b } = two();
      a.rollover();
      b.rollover();
      b.close();

      getLastFakeEventSource()!.triggerOpen();

      expect(getFakeEventSourceInstances()).toHaveLength(3);
      a.close();
    });

    it("releases the slot as soon as the pending source errors", () => {
      vi.useFakeTimers();
      const { a, b } = two();
      a.rollover();
      b.rollover();

      getLastFakeEventSource()!.triggerError();

      expect(getLastFakeEventSource()!.url).toContain("c%2F2");
      expect(getLastFakeEventSource()!.closed).toBe(false);
      a.close();
      b.close();
    });

    it("does not let one hub block rollovers on another", () => {
      const token = { value: "tok-a" };
      const a = subscribeMercure(["c/1"], vi.fn(), () => token.value, {}, HUB);
      getLastFakeEventSource()!.triggerOpen();
      const b = subscribeMercure(["c/2"], vi.fn(), () => token.value, {}, OTHER_HUB);
      getLastFakeEventSource()!.triggerOpen();

      a.rollover();
      b.rollover();

      expect(getFakeEventSourceInstances()).toHaveLength(4);
      expect(getLastFakeEventSource()!.url.startsWith(OTHER_HUB)).toBe(true);
      a.close();
      b.close();
    });

    it("times out a pending source that never opens and lets the next rollover run", () => {
      vi.useFakeTimers();
      const { a, b, aMain } = two();
      a.rollover();
      const aPending = getLastFakeEventSource()!;
      b.rollover();

      vi.advanceTimersByTime(15_000);

      expect(aPending.closed).toBe(true);
      expect(aMain.closed).toBe(false);
      const bPending = getLastFakeEventSource()!;
      expect(bPending.url).toContain("c%2F2");
      expect(bPending.closed).toBe(false);

      bPending.triggerOpen();
      vi.advanceTimersByTime(1_000);
      const aRetry = getLastFakeEventSource()!;
      expect(aRetry.url).toContain("c%2F1");
      aRetry.triggerOpen();
      expect(aMain.closed).toBe(true);
      expect(active()).toEqual([bPending, aRetry]);
      a.close();
      b.close();
    });
  });

  describe("recovery detection after a long pause", () => {
    it("reports a rollover as a recovery when the clock jumped before the sleep detector ticked", () => {
      vi.useFakeTimers();
      const token = { value: "tok-a" };
      const { sub, onReconnect } = open(token);

      vi.setSystemTime(Date.now() + 7 * 60_000);
      sub.rollover();
      getLastFakeEventSource()!.triggerOpen();

      expect(onReconnect).toHaveBeenCalledOnce();
      sub.close();
    });

    it("does not report rollovers while timers keep running, however long the stream lived", () => {
      vi.useFakeTimers();
      const token = { value: "tok-a" };
      const { sub, onReconnect } = open(token);

      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(28 * 60_000);
        sub.rollover();
        getLastFakeEventSource()!.triggerOpen();
      }

      expect(onReconnect).not.toHaveBeenCalled();
      sub.close();
    });
  });
});
