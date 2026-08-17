import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import {
  useCommunities,
  usePinCommunity,
  usePinnedCommunities,
  useReorderPinnedCommunities,
} from "@/queries/communityQueries";
import { useAuth } from "@/hooks/useAuth";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useNotification } from "@/context/NotificationContext";
import { useMyCommunityMemberships } from "@/queries/membershipQueries";
import { communityMemberIdSet, isCommunityMember } from "@/utils/membership";
import { logoUrl } from "@/api/client";
import { communityTileStyle } from "@/utils/communityTile";
import { PinIcon } from "@/components/icons";
import type { Community } from "@/types/api";

interface Props {
  unreadCounts: Record<string, number>;
  renderTileExtra?: (community: Community) => React.ReactNode;
}

export function CommunityRail({ unreadCounts, renderTileExtra }: Props) {
  const { t } = useTranslation("community");
  const { notify } = useNotification();
  const { user } = useAuth();
  const { data: pinnedData } = usePinnedCommunities();
  const { data: communities = [] } = useCommunities();
  const { data: myMemberships } = useMyCommunityMemberships();
  const reorder = useReorderPinnedCommunities();
  const pinMutation = usePinCommunity();
  const canPin = !!user;

  const isGlobalAdmin = user?.roles?.includes("ROLE_ADMIN") ?? false;
  const memberIds = useMemo(() => communityMemberIdSet(myMemberships), [myMemberships]);
  const isMemberOf = useMemo(
    () => (c: Community) => isCommunityMember(c.id, memberIds, isGlobalAdmin),
    [memberIds, isGlobalAdmin],
  );

  const pinned = useMemo(() => pinnedData?.items ?? [], [pinnedData]);
  const pinnedIdSet = useMemo(() => new Set(pinned.map((p) => p.community.id)), [pinned]);

  const params = useParams({ strict: false }) as { communityId?: string };
  const activeUnpinned = useMemo(() => {
    if (!params.communityId) return null;
    const active = communities.find((c) => c.identifier === params.communityId);
    if (!active || pinnedIdSet.has(active.id)) return null;
    return active;
  }, [params.communityId, communities, pinnedIdSet]);

  const overflow = useMemo(
    () => communities.filter((c) => !pinnedIdSet.has(c.id) && c.id !== activeUnpinned?.id),
    [communities, pinnedIdSet, activeUnpinned],
  );

  const isAnon = !user;
  const markerRef = useRef<HTMLDivElement>(null);
  const [railCapacity, setRailCapacity] = useState(4);

  useLayoutEffect(() => {
    if (!isAnon) return;
    const nav = markerRef.current?.parentElement;
    if (!nav) return;
    const TILE = 52.5;
    const RESERVED = 120;
    const compute = () =>
      setRailCapacity(Math.max(1, Math.floor((nav.clientHeight - RESERVED) / TILE)));
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [isAnon]);

  const anonVisible = useMemo(() => {
    if (!isAnon) return [];
    const cap = communities.length > railCapacity ? Math.max(1, railCapacity - 1) : railCapacity;
    const list = communities.slice(0, cap);
    const active = communities.find((c) => c.identifier === params.communityId);
    if (active && !list.some((c) => c.id === active.id)) list[list.length - 1] = active;
    return list;
  }, [isAnon, communities, railCapacity, params.communityId]);

  const anonOverflow = useMemo(() => {
    if (!isAnon) return [];
    const visibleIds = new Set(anonVisible.map((c) => c.id));
    return communities.filter((c) => !visibleIds.has(c.id));
  }, [isAnon, communities, anonVisible]);

  const dragFromRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function onDragStart(i: number) {
    dragFromRef.current = i;
  }

  function onDragOver(e: React.DragEvent, i: number) {
    if (dragFromRef.current === null) return;
    e.preventDefault();
    if (i !== dragOverIndex) setDragOverIndex(i);
  }

  function onDrop(target: number) {
    const from = dragFromRef.current;
    dragFromRef.current = null;
    setDragOverIndex(null);
    if (from === null || from === target) return;

    const ids = pinned.map((p) => p.community.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(target, 0, moved);

    reorder.mutate(ids, {
      onError: () => notify(t("rail_reorder_error"), "error"),
    });
  }

  async function quickPin(c: Community) {
    try {
      await pinMutation.mutateAsync(c.id);
    } catch {
      notify(t("rail_pin_error"), "error");
    }
  }

  if (isAnon) {
    return (
      <>
        <div ref={markerRef} className="h-0 w-0" />
        {anonVisible.map((c) => (
          <div key={c["@id"]} className="relative">
            <CommunityTile
              community={c}
              unread={0}
              isMember
              isActive={c.identifier === params.communityId}
            />
            {renderTileExtra?.(c)}
          </div>
        ))}
        {anonOverflow.length > 0 && (
          <OverflowButton
            communities={anonOverflow}
            unreadCounts={unreadCounts}
            onQuickPin={quickPin}
            canPin={false}
            isMemberOf={isMemberOf}
          />
        )}
      </>
    );
  }

  return (
    <>
      {pinned.map(({ community: c }, i) => (
        <div
          key={c["@id"]}
          className="relative"
          draggable
          onDragStart={() => onDragStart(i)}
          onDragOver={(e) => onDragOver(e, i)}
          onDrop={() => onDrop(i)}
          onDragEnd={() => {
            dragFromRef.current = null;
            setDragOverIndex(null);
          }}
          style={{ opacity: dragOverIndex === i ? 0.5 : 1 }}
        >
          <CommunityTile
            community={c}
            unread={unreadCounts[String(c.id)] ?? 0}
            isMember={isMemberOf(c)}
            isActive={c.identifier === params.communityId}
          />
          {renderTileExtra?.(c)}
        </div>
      ))}
      {activeUnpinned && (
        <div className="relative" title={t("rail_active_unpinned_hint")}>
          <CommunityTile
            community={activeUnpinned}
            unread={unreadCounts[String(activeUnpinned.id)] ?? 0}
            isMember={isMemberOf(activeUnpinned)}
            isActive
          />
          {canPin && (
            <button
              type="button"
              onClick={() => quickPin(activeUnpinned)}
              title={t("rail_pin")}
              className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-fg-muted ring-2 ring-rail hover:bg-raised"
            >
              <PinIcon size={10} />
            </button>
          )}
          {renderTileExtra?.(activeUnpinned)}
        </div>
      )}
      {overflow.length === 1 && overflow[0] ? (
        <div className="relative">
          <CommunityTile
            community={overflow[0]}
            unread={unreadCounts[String(overflow[0].id)] ?? 0}
            isMember={isMemberOf(overflow[0])}
          />
          {renderTileExtra?.(overflow[0])}
        </div>
      ) : (
        overflow.length > 1 && (
          <OverflowButton
            communities={overflow}
            unreadCounts={unreadCounts}
            onQuickPin={quickPin}
            canPin={canPin}
            isMemberOf={isMemberOf}
          />
        )
      )}
    </>
  );
}

function CommunityTile({
  community: c,
  unread,
  isMember,
  isActive = false,
}: {
  community: Community;
  unread: number;
  isMember: boolean;
  isActive?: boolean;
}) {
  const { t } = useTranslation("community");
  return (
    <>
      {isActive && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-[11px] top-1/2 h-[30px] w-1 -translate-y-1/2 rounded-r"
          style={{ backgroundColor: c.accentColor ?? "var(--accent)" }}
        />
      )}
      <Link
        to="/$communityId"
        params={{ communityId: c.identifier }}
        style={communityTileStyle(c)}
        className={`flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-[13px] font-bold transition-opacity hover:opacity-80 ${!isMember ? "opacity-50" : ""}`}
        activeProps={{
          "aria-current": "page",
          className:
            "flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-[13px] font-bold opacity-100",
        }}
        activeOptions={{ exact: false }}
        title={isMember ? c.name : t("not_joined", { name: c.name })}
      >
        {c.logo?.contentUrl ? (
          <img
            src={logoUrl(c.logo.contentUrl, "md") ?? undefined}
            alt={c.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="block cap-trim">{c.name.charAt(0).toUpperCase()}</span>
        )}
      </Link>
      {unread > 0 && (
        <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[0.625rem] font-bold text-white ring-2 ring-rail">
          <span className="block cap-trim">{unread > 9 ? "9+" : unread}</span>
        </span>
      )}
    </>
  );
}

function OverflowButton({
  communities,
  unreadCounts,
  onQuickPin,
  canPin,
  isMemberOf,
}: {
  communities: Community[];
  unreadCounts: Record<string, number>;
  onQuickPin: (c: Community) => void;
  canPin: boolean;
  isMemberOf: (c: Community) => boolean;
}) {
  const { t } = useTranslation("community");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const totalUnread = communities.reduce((sum, c) => sum + (unreadCounts[String(c.id)] ?? 0), 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("rail_overflow_title")}
        className="flex h-[42px] w-[42px] items-center justify-center rounded-[13px] bg-surface text-fg-muted hover:bg-raised hover:text-fg"
      >
        <span className="text-sm font-semibold">+{communities.length}</span>
        {totalUnread > 0 && (
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[0.625rem] font-bold text-white ring-2 ring-rail">
            <span className="block cap-trim">{totalUnread > 9 ? "9+" : totalUnread}</span>
          </span>
        )}
      </button>
      {open && (
        <div className="animate-menu-in absolute left-full top-0 z-50 ml-2 w-64 rounded-lg border border-line bg-overlay py-1 shadow-soft-lg">
          <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t("rail_overflow_heading")}
          </p>
          <ul className="max-h-80 overflow-y-auto">
            {[...communities]
              .sort((a, b) => Number(isMemberOf(b)) - Number(isMemberOf(a)))
              .map((c) => (
                <li
                  key={c["@id"]}
                  className="group flex items-center gap-2 px-2 py-1.5 hover:bg-surface"
                >
                  <Link
                    to="/$communityId"
                    params={{ communityId: c.identifier }}
                    onClick={() => setOpen(false)}
                    className={`flex flex-1 items-center gap-2 truncate text-sm text-fg ${!isMemberOf(c) ? "opacity-60" : ""}`}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-bold"
                      style={communityTileStyle(c)}
                    >
                      {c.logo?.contentUrl ? (
                        <img
                          src={logoUrl(c.logo.contentUrl) ?? undefined}
                          alt={c.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="block cap-trim">{c.name.charAt(0).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="truncate">{c.name}</span>
                    {!isMemberOf(c) && (
                      <span className="ml-1 shrink-0 text-[0.625rem] uppercase tracking-wide text-fg-subtle">
                        {t("rail_browse")}
                      </span>
                    )}
                    {(unreadCounts[String(c.id)] ?? 0) > 0 && (
                      <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold text-white">
                        <span className="block cap-trim">
                          {(unreadCounts[String(c.id)] ?? 0) > 9
                            ? "9+"
                            : unreadCounts[String(c.id)]}
                        </span>
                      </span>
                    )}
                  </Link>
                  {canPin && (
                    <button
                      type="button"
                      onClick={() => onQuickPin(c)}
                      title={t("rail_pin")}
                      className="flex items-center justify-center rounded p-1 text-fg-subtle opacity-0 hover:bg-surface hover:text-fg group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      <PinIcon size={12} />
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
