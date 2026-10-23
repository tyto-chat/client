export interface MercureHandlers {
  onReconnect?: () => void;
  onStaleToken?: () => void;
  onSustainedFailure?: () => void;
}

export interface MercureSubscription {
  close(): void;
  rollover(): void;
}

const SEEN_ID_LIMIT = 500;
const PENDING_MAX_ERRORS = 3;
const PENDING_OPEN_TIMEOUT_MS = 15_000;
const SLEEP_TICK_MS = 30_000;
const SLEEP_GAP_MS = 2 * 60_000;

interface RolloverTicket {
  lane: string;
  start: () => void;
}

interface RolloverLane {
  queue: RolloverTicket[];
  holder: RolloverTicket | null;
}

const rolloverLanes = new Map<string, RolloverLane>();

let lastSleepAt = 0;
let lastTick = 0;
let sleepWatchers = 0;
let sleepTimer: ReturnType<typeof setInterval> | null = null;

function sleptSince(since: number): boolean {
  return lastSleepAt > since || Date.now() - lastTick > SLEEP_GAP_MS;
}

function watchSleep(): () => void {
  if (sleepWatchers++ === 0) {
    lastTick = Date.now();
    sleepTimer = setInterval(() => {
      const now = Date.now();
      if (now - lastTick > SLEEP_GAP_MS) lastSleepAt = now;
      lastTick = now;
    }, SLEEP_TICK_MS);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--sleepWatchers === 0 && sleepTimer) {
      clearInterval(sleepTimer);
      sleepTimer = null;
    }
  };
}

function laneFor(key: string): RolloverLane {
  let lane = rolloverLanes.get(key);
  if (!lane) {
    lane = { queue: [], holder: null };
    rolloverLanes.set(key, lane);
  }
  return lane;
}

function pumpRollovers(lane: RolloverLane): void {
  if (lane.holder) return;
  const next = lane.queue.shift();
  if (!next) return;
  lane.holder = next;
  next.start();
}

function requestRollover(laneKey: string, start: () => void): RolloverTicket {
  const ticket = { lane: laneKey, start };
  const lane = laneFor(laneKey);
  lane.queue.push(ticket);
  pumpRollovers(lane);
  return ticket;
}

function finishRollover(ticket: RolloverTicket): void {
  const lane = laneFor(ticket.lane);
  const index = lane.queue.indexOf(ticket);
  if (index >= 0) lane.queue.splice(index, 1);
  if (lane.holder === ticket) {
    lane.holder = null;
    pumpRollovers(lane);
  }
}

interface Slot {
  source: EventSource | null;
  errors: number;
  timer: ReturnType<typeof setTimeout> | null;
  deadline: ReturnType<typeof setTimeout> | null;
}

function newSlot(): Slot {
  return { source: null, errors: 0, timer: null, deadline: null };
}

function clearDeadline(slot: Slot): void {
  if (slot.deadline) clearTimeout(slot.deadline);
  slot.deadline = null;
}

function disposeSlot(slot: Slot): void {
  if (slot.timer) clearTimeout(slot.timer);
  slot.timer = null;
  clearDeadline(slot);
  slot.source?.close();
  slot.source = null;
}

export function subscribeMercure(
  topics: string[],
  onMessage: (event: MessageEvent) => void,
  mercureToken: string | null | undefined | (() => string | null | undefined),
  handlers: MercureHandlers = {},
  hubUrl?: string,
): MercureSubscription {
  if (!hubUrl) return { close: () => {}, rollover: () => {} };

  const currentToken = typeof mercureToken === "function" ? mercureToken : () => mercureToken;
  const buildUrl = (resume: boolean) => {
    const base = new URL(hubUrl);
    for (const topic of topics) {
      base.searchParams.append("topic", topic);
    }
    const token = currentToken();
    if (token) {
      base.searchParams.set("authorization", token);
    }
    if (resume && lastDeliveredId) {
      base.searchParams.set("lastEventID", lastDeliveredId);
    }
    return base.toString();
  };

  let main = newSlot();
  let pending: Slot | null = null;
  let replaying: Slot | null = null;
  let ticket: RolloverTicket | null = null;
  let lastDeliveredId: string | null = null;
  let closed = false;
  let everOpened = false;
  let activeSince = 0;
  let notifiedFailure = false;
  const seenIds = new Set<string>();

  const trimSeen = () => {
    if (pending || replaying) return;
    while (seenIds.size > SEEN_ID_LIMIT) {
      const oldest = seenIds.values().next().value;
      if (oldest === undefined) return;
      seenIds.delete(oldest);
    }
  };

  const deliver = (event: MessageEvent, slot: Slot) => {
    const id = event.lastEventId;
    if (id) {
      if (seenIds.has(id)) return;
      seenIds.add(id);
      lastDeliveredId = id;
      if (slot === replaying) replaying = null;
      trimSeen();
    }
    onMessage(event);
  };

  const isLive = (slot: Slot) => !closed && (slot === main || slot === pending);

  const endRollover = () => {
    if (pending) disposeSlot(pending);
    pending = null;
    if (ticket) finishRollover(ticket);
    ticket = null;
    trimSeen();
  };

  const promote = (slot: Slot) => {
    const recovered = everOpened && (main.errors > 0 || sleptSince(activeSince));
    clearDeadline(slot);
    disposeSlot(main);
    main = slot;
    main.errors = 0;
    pending = null;
    replaying = slot;
    notifiedFailure = false;
    everOpened = true;
    activeSince = Date.now();
    if (ticket) finishRollover(ticket);
    ticket = null;
    if (recovered) handlers.onReconnect?.();
  };

  const markMainOpen = () => {
    const recovered = main.errors > 0;
    main.errors = 0;
    notifiedFailure = false;
    if (everOpened && recovered) handlers.onReconnect?.();
    everOpened = true;
    activeSince = Date.now();
  };

  const failPending = (slot: Slot, es: EventSource) => {
    slot.errors += 1;
    es.close();
    slot.source = null;
    clearDeadline(slot);
    if (ticket) finishRollover(ticket);
    ticket = null;
    if (slot.errors >= PENDING_MAX_ERRORS) {
      endRollover();
      return;
    }
    const delay = Math.min(1000 * 2 ** Math.min(slot.errors - 1, 5), 30000);
    slot.timer = setTimeout(() => {
      slot.timer = null;
      if (closed || pending !== slot) return;
      ticket = requestRollover(hubUrl, () => connect(slot));
    }, delay);
  };

  const fail = (slot: Slot, es: EventSource) => {
    if (!isLive(slot) || slot.source !== es) return;
    if (slot === pending) {
      failPending(slot, es);
      return;
    }
    slot.errors += 1;
    es.close();
    slot.source = null;
    if (slot.errors % 4 === 0) handlers.onStaleToken?.();
    if (slot.errors >= 5 && !notifiedFailure) {
      notifiedFailure = true;
      handlers.onSustainedFailure?.();
    }
    const delay = Math.min(1000 * 2 ** Math.min(slot.errors - 1, 5), 30000);
    slot.timer = setTimeout(() => connect(slot), delay);
  };

  const connect = (slot: Slot) => {
    slot.timer = null;
    if (!isLive(slot)) return;
    const recovering = !everOpened || main.errors > 0 || sleptSince(activeSince);
    const es = new EventSource(buildUrl(slot === pending && !recovering));
    slot.source = es;
    if (slot === pending) {
      slot.deadline = setTimeout(() => {
        slot.deadline = null;
        if (isLive(slot) && slot.source === es) failPending(slot, es);
      }, PENDING_OPEN_TIMEOUT_MS);
    }

    es.onopen = () => {
      if (!isLive(slot) || slot.source !== es) return;
      if (slot === pending) promote(slot);
      else markMainOpen();
    };
    es.onmessage = (event) => {
      if (isLive(slot) && slot.source === es) deliver(event, slot);
    };
    es.onerror = () => fail(slot, es);
  };

  const releaseSleepWatch = watchSleep();
  connect(main);

  return {
    close: () => {
      closed = true;
      releaseSleepWatch();
      disposeSlot(main);
      endRollover();
    },
    rollover: () => {
      if (closed) return;
      if (ticket && !pending) return;
      endRollover();
      ticket = requestRollover(hubUrl, () => {
        const slot = newSlot();
        pending = slot;
        connect(slot);
      });
    },
  };
}
