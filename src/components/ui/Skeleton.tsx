import { railWidthClass } from "@/platform/appMode";

const MESSAGE_ROW_WIDTHS = [
  ["w-40", "w-3/5", "w-2/5"],
  ["w-28", "w-4/5"],
  ["w-36", "w-1/2", "w-1/3"],
  ["w-32", "w-2/3"],
  ["w-44", "w-3/4", "w-1/4"],
  ["w-24", "w-1/2"],
  ["w-36", "w-2/3", "w-2/5"],
  ["w-28", "w-3/5"],
] as const;

const CHANNEL_ROW_WIDTHS = ["w-24", "w-32", "w-20", "w-28", "w-24", "w-36", "w-20"] as const;

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-fg/10 motion-reduce:animate-none ${className}`} />
  );
}

function MessageRowSkeleton({ widths }: { widths: readonly string[] }) {
  return (
    <div data-skeleton-row className="flex gap-3">
      <div className="w-9 shrink-0">
        <SkeletonBlock className="h-9 w-9 rounded-full" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        {widths.map((w, j) => (
          <SkeletonBlock key={j} className={`${j === 0 ? "h-3.5" : "h-3"} ${w}`} />
        ))}
      </div>
    </div>
  );
}

function ComposerSkeleton() {
  return (
    <div data-skeleton-composer className="px-[18px] pt-1 pb-2">
      <SkeletonBlock className="min-h-[3rem] w-full rounded-lg border border-line" />
    </div>
  );
}

export function MessageRowsSkeleton({ composer = false }: { composer?: boolean }) {
  return (
    <div data-testid="message-rows-skeleton" aria-hidden="true" className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-5 overflow-hidden px-[18px] pt-3.5 pb-3">
        {MESSAGE_ROW_WIDTHS.map((widths, i) => (
          <MessageRowSkeleton key={i} widths={widths} />
        ))}
      </div>
      {composer && <ComposerSkeleton />}
    </div>
  );
}

export function MessagePaneSkeleton({ composer = true }: { composer?: boolean }) {
  return (
    <div
      data-testid="message-pane-skeleton"
      aria-hidden="true"
      className="flex min-w-0 flex-1 flex-col"
    >
      <header className="flex items-center gap-1.5 border-b border-line px-4 py-3 max-md:hidden">
        <SkeletonBlock className="h-4 w-32" />
        <div className="ml-auto flex items-center gap-1.5">
          <SkeletonBlock className="h-8 w-8 rounded-lg" />
          <SkeletonBlock className="h-8 w-8 rounded-lg" />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <MessageRowsSkeleton composer={composer} />
      </div>
    </div>
  );
}

export function ChannelSidebarSkeleton() {
  return (
    <div
      data-testid="channel-sidebar-skeleton"
      aria-hidden="true"
      className="flex w-60 shrink-0 flex-col bg-surface px-2 pb-4 max-md:hidden"
    >
      <div className="-mx-2 mb-2 flex items-center justify-between gap-2 border-b-2 border-[color-mix(in_srgb,var(--accent)_55%,transparent)] px-4 py-3">
        <SkeletonBlock className="h-4 w-28" />
        <div className="flex h-8 items-center gap-0.5">
          <SkeletonBlock className="h-7 w-7 rounded-lg" />
          <SkeletonBlock className="h-7 w-7 rounded-lg" />
        </div>
      </div>
      <ChannelRowsSkeleton />
    </div>
  );
}

export function ChannelRowsSkeleton() {
  return (
    <div
      data-testid="channel-rows-skeleton"
      aria-hidden="true"
      className="flex flex-col gap-1 pt-1.5"
    >
      {CHANNEL_ROW_WIDTHS.map((w, i) => (
        <div key={i} data-skeleton-row className="flex h-7 items-center gap-2 px-2">
          <SkeletonBlock className="h-4 w-4 rounded" />
          <SkeletonBlock className={`h-3 ${w}`} />
        </div>
      ))}
    </div>
  );
}

const CONVERSATION_ROW_WIDTHS = ["w-28", "w-20", "w-32", "w-24", "w-16"] as const;

export function ConversationRowsSkeleton() {
  return (
    <div
      data-testid="conversation-rows-skeleton"
      aria-hidden="true"
      className="flex flex-col gap-1 pt-1.5"
    >
      {CONVERSATION_ROW_WIDTHS.map((w, i) => (
        <div key={i} data-skeleton-row className="flex h-8 items-center gap-2 px-2">
          <SkeletonBlock className="h-6 w-6 rounded-full" />
          <SkeletonBlock className={`h-3 ${w}`} />
        </div>
      ))}
    </div>
  );
}

export function ThreadRepliesSkeleton() {
  return (
    <div
      data-testid="thread-replies-skeleton"
      aria-hidden="true"
      className="flex flex-col gap-4 px-4 py-3"
    >
      {MESSAGE_ROW_WIDTHS.slice(0, 3).map((widths, i) => (
        <MessageRowSkeleton key={i} widths={widths} />
      ))}
    </div>
  );
}

export function AppSkeleton() {
  return (
    <div data-testid="app-skeleton" aria-hidden="true" className="flex h-screen w-screen bg-canvas">
      <div
        className={`flex ${railWidthClass()} shrink-0 flex-col items-center gap-2.5 bg-rail py-3`}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonBlock key={i} className="h-[42px] w-[42px] rounded-[13px]" />
        ))}
      </div>
      <ChannelSidebarSkeleton />
      <MessagePaneSkeleton />
    </div>
  );
}
