import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Compass, Home, Pin } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Modal } from "@/components/Modal";
import { GripVerticalIcon } from "@/components/icons";
import { SettingsNav, type SettingsNavGroup } from "@/components/ui/SettingsNav";
import {
  useCommunities,
  useJoinCommunity,
  usePinCommunity,
  usePinnedCommunities,
  useReorderPinnedCommunities,
  useUnpinCommunity,
} from "@/queries/communityQueries";
import { useNotification } from "@/context/NotificationContext";
import { logoUrl } from "@/api/client";
import { communityTileStyle } from "@/utils/communityTile";
import { useMyCommunityMemberships } from "@/queries/membershipQueries";
import { communityMemberIdSet } from "@/utils/membership";
import type { Community, HydraCollection } from "@/types/api";
import { isManagedIdentityMode } from "@/platform/appMode";
import { requestIdentitySwitch } from "@/platform/activeIdentity";
import { getPlatformBridge } from "@/platform/bridge";
import { ConnectionsContext } from "@/desktop/connections/ConnectionsContext";
import type { ConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import {
  buildManagerGroups,
  refreshIdentityData,
  type ManagerIdentityGroup,
} from "@/desktop/managerData";
import {
  getServerOrderSnapshot,
  persistServerOrder,
  subscribeServerOrder,
} from "@/desktop/serverOrderStore";
import {
  identityDelete,
  identityFetch,
  identityPost,
  unwrapMember,
} from "@/desktop/connections/identityFetch";
import type { ConnectionCommunity } from "@/desktop/connections/IdentityConnection";
import { hostFromOrigin, connectionCommunityTileStyle } from "@/utils/serverDisplay";

type Tab = "pinned" | "your" | "other";

interface Props {
  onClose: () => void;
}

export function CommunityManagerModal({ onClose }: Props) {
  const { t } = useTranslation(["community", "common"]);
  const [tab, setTab] = useState<Tab>("pinned");
  const connectionsContext = useContext(ConnectionsContext);
  const desktopManaged = isManagedIdentityMode() && !!connectionsContext;

  const groups: SettingsNavGroup<Tab>[] = [
    {
      heading: t("nav_group_communities"),
      items: [
        { key: "pinned", label: t("manager_tab_pinned"), icon: Pin },
        { key: "your", label: t("manager_tab_your"), icon: Home },
        { key: "other", label: t("manager_tab_other"), icon: Compass },
      ],
    },
  ];

  return (
    <Modal title={t("manager_title")} size="2xl" onClose={onClose}>
      {(close) => (
        <div className="flex max-md:flex-col md:h-[min(37.5rem,70vh)] md:gap-6">
          <SettingsNav groups={groups} active={tab} onChange={setTab} testIdPrefix="manager-tab-" />
          <div className="min-w-0 flex-1 md:h-full md:overflow-y-auto">
            {desktopManaged && connectionsContext ? (
              <DesktopManagerPanel
                tab={tab}
                onClose={close}
                registry={connectionsContext.registry}
              />
            ) : (
              <>
                {tab === "pinned" && <PinnedTab onClose={close} />}
                {tab === "your" && <YourTab onClose={close} />}
                {tab === "other" && <OtherTab onClose={close} />}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function PinnedTab({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const { data, isLoading } = usePinnedCommunities();
  const reorder = useReorderPinnedCommunities();
  const unpin = useUnpinCommunity();
  const pinned = useMemo(() => data?.items ?? [], [data]);

  const dragFromRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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

  if (isLoading) return <p className="text-sm text-fg-subtle">{t("common:loading")}</p>;
  if (pinned.length === 0) {
    return <p className="text-sm text-fg-subtle">{t("manager_pinned_empty")}</p>;
  }

  return (
    <ul className="space-y-1">
      {pinned.map(({ community: c }, i) => (
        <li
          key={c["@id"]}
          draggable
          onDragStart={(e) => {
            if (e.dataTransfer) {
              e.dataTransfer.setData("text/plain", "");
              e.dataTransfer.effectAllowed = "move";
            }
            dragFromRef.current = i;
          }}
          onDragOver={(e) => {
            if (dragFromRef.current === null) return;
            e.preventDefault();
            if (i !== dragOverIndex) setDragOverIndex(i);
          }}
          onDrop={() => onDrop(i)}
          onDragEnd={() => {
            dragFromRef.current = null;
            setDragOverIndex(null);
          }}
          style={{ opacity: dragOverIndex === i ? 0.5 : 1 }}
          className="flex cursor-move items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-line"
        >
          <CommunityRow community={c} onClose={onClose} />
          <button
            type="button"
            onClick={() => unpin.mutate(c.id)}
            disabled={unpin.isPending}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-50 dark:hover:text-white"
          >
            {t("manager_unpin")}
          </button>
        </li>
      ))}
    </ul>
  );
}

function YourTab({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["community", "common"]);
  const { data: communities = [], isLoading } = useCommunities();
  const { data: pinnedData } = usePinnedCommunities();
  const { data: myMemberships } = useMyCommunityMemberships();
  const pin = usePinCommunity();
  const unpin = useUnpinCommunity();

  const pinnedIdSet = useMemo(
    () => new Set((pinnedData?.items ?? []).map((p) => p.community.id)),
    [pinnedData],
  );
  const memberIds = useMemo(() => communityMemberIdSet(myMemberships), [myMemberships]);
  const your = useMemo(
    () => communities.filter((c) => memberIds.has(c.id)),
    [communities, memberIds],
  );

  if (isLoading) return <p className="text-sm text-fg-subtle">{t("common:loading")}</p>;
  if (your.length === 0) {
    return <p className="text-sm text-fg-subtle">{t("manager_your_empty")}</p>;
  }

  return (
    <ul className="space-y-1">
      {your.map((c) => {
        const isPinned = pinnedIdSet.has(c.id);
        return (
          <li
            key={c["@id"]}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface"
          >
            <CommunityRow community={c} onClose={onClose} />
            <button
              type="button"
              onClick={() => (isPinned ? unpin.mutate(c.id) : pin.mutate(c.id))}
              disabled={pin.isPending || unpin.isPending}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-50 dark:hover:text-white"
            >
              {isPinned ? t("manager_unpin") : t("manager_pin")}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OtherTab({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const { data: communities = [], isLoading } = useCommunities();
  const { data: myMemberships } = useMyCommunityMemberships();
  const join = useJoinCommunity();

  const memberIds = useMemo(() => communityMemberIdSet(myMemberships), [myMemberships]);
  const other = useMemo(
    () => communities.filter((c) => !memberIds.has(c.id) && c.isPrivate !== true),
    [communities, memberIds],
  );

  async function handleJoin(c: Community) {
    try {
      await join.mutateAsync(c.identifier);
      notify(t("joined_community", { name: c.name }), "success");
    } catch {
      notify(t("join_failed"), "error");
    }
  }

  if (isLoading) return <p className="text-sm text-fg-subtle">{t("common:loading")}</p>;
  if (other.length === 0) {
    return <p className="text-sm text-fg-subtle">{t("manager_other_empty")}</p>;
  }

  return (
    <ul className="space-y-1">
      {other.map((c) => (
        <li
          key={c["@id"]}
          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface"
        >
          <CommunityRow community={c} onClose={onClose} />
          <button
            type="button"
            onClick={() => handleJoin(c)}
            disabled={join.isPending}
            className="rounded-lg bg-accent-gradient px-3 py-1 text-xs font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {t("join_community")}
          </button>
        </li>
      ))}
    </ul>
  );
}

function useLiveManagerGroups(registry: ConnectionRegistry): {
  groups: ManagerIdentityGroup[];
  activeIdentityId: string | null;
} {
  const subscribe = useCallback((listener: () => void) => registry.subscribe(listener), [registry]);
  const getSnapshot = useCallback(() => registry.getSnapshot(), [registry]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const order = useSyncExternalStore(subscribeServerOrder, getServerOrderSnapshot);
  const groups = useMemo(
    () => buildManagerGroups(registry, order),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, snapshot, order],
  );
  return { groups, activeIdentityId: snapshot.activeIdentityId };
}

function ServerChip({
  label,
  muted,
  dragHandle,
}: {
  label: string;
  muted?: boolean;
  dragHandle?: ReactNode;
}) {
  return (
    <div
      data-testid="manager-server-chip"
      className={`mb-1.5 flex items-center gap-1.5 px-2 text-xs font-semibold ${muted ? "text-fg-subtle opacity-60" : "text-fg-subtle"}`}
    >
      {dragHandle}
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function SortableGroupRow({
  identityId,
  children,
}: {
  identityId: string;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation("common");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: identityId,
  });
  const dragHandle = (
    <button
      type="button"
      data-testid="manager-server-drag-handle"
      aria-label={t("drag_to_reorder")}
      className="cursor-grab text-fg-subtle hover:text-fg active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVerticalIcon size={14} />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      {children(dragHandle)}
    </div>
  );
}

function DesktopManagerPanel({
  tab,
  onClose,
  registry,
}: {
  tab: Tab;
  onClose: () => void;
  registry: ConnectionRegistry;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { groups, activeIdentityId } = useLiveManagerGroups(registry);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (groups.length === 0) {
    return <p className="text-sm text-fg-subtle">{t("common:loading")}</p>;
  }

  function renderGroup(group: ManagerIdentityGroup, dragHandle?: ReactNode) {
    return group.identityId === activeIdentityId ? (
      <ActiveIdentitySection
        key={group.identityId}
        group={group}
        tab={tab}
        onClose={onClose}
        dragHandle={dragHandle}
      />
    ) : (
      <RemoteIdentitySection
        key={group.identityId}
        group={group}
        tab={tab}
        onClose={onClose}
        registry={registry}
        dragHandle={dragHandle}
      />
    );
  }

  if (tab === "other") {
    return (
      <BrowseOtherPanel
        groups={groups}
        activeIdentityId={activeIdentityId}
        onClose={onClose}
        registry={registry}
      />
    );
  }

  if (tab === "your") {
    return <div className="space-y-4">{groups.map((group) => renderGroup(group))}</div>;
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = groups.map((g) => g.identityId);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    void persistServerOrder(getPlatformBridge(), arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={groups.map((g) => g.identityId)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-4">
          {groups.map((group) => (
            <SortableGroupRow key={group.identityId} identityId={group.identityId}>
              {(dragHandle) => renderGroup(group, dragHandle)}
            </SortableGroupRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function ActiveIdentitySection({
  group,
  tab,
  onClose,
  dragHandle,
}: {
  group: ManagerIdentityGroup;
  tab: Tab;
  onClose: () => void;
  dragHandle?: ReactNode;
}) {
  return (
    <div data-testid="manager-identity-group" data-identity-id={group.identityId}>
      <ServerChip
        label={group.serverName ?? hostFromOrigin(group.origin)}
        dragHandle={dragHandle}
      />
      {tab === "pinned" && <PinnedTab onClose={onClose} />}
      {tab === "your" && <YourTab onClose={onClose} />}
    </div>
  );
}

function rowsForTab(tab: Tab, communities: ConnectionCommunity[]): ConnectionCommunity[] {
  if (tab === "pinned") return communities.filter((c) => c.pinned);
  return communities.filter((c) => c.member);
}

function RemoteIdentitySection({
  group,
  tab,
  onClose,
  registry,
  dragHandle,
}: {
  group: ManagerIdentityGroup;
  tab: Tab;
  onClose: () => void;
  registry: ConnectionRegistry;
  dragHandle?: ReactNode;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const rows = rowsForTab(tab, group.communities);
  const disabled = !group.healthy || !group.ctx;
  const emptyLabel = tab === "pinned" ? t("manager_pinned_empty") : t("manager_your_empty");
  const reorderable = tab === "pinned" && !disabled && rows.length > 1;

  const dragFromRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function handleReorderDrop(target: number) {
    const from = dragFromRef.current;
    dragFromRef.current = null;
    setDragOverIndex(null);
    const ctx = group.ctx;
    if (from === null || from === target || !ctx) return;

    const ids = rows.map((r) => r.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(target, 0, moved);
    void (async () => {
      try {
        await identityPost(ctx, "/me/pinned-communities/order", { communityIds: ids });
      } catch {
        notify(t("rail_reorder_error"), "error");
      } finally {
        await refreshIdentityData(registry, group.identityId);
      }
    })();
  }

  async function runAction(communityId: number, action: () => Promise<unknown>): Promise<void> {
    setPendingIds((prev) => new Set(prev).add(communityId));
    try {
      await action();
    } finally {
      await refreshIdentityData(registry, group.identityId);
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(communityId);
        return next;
      });
    }
  }

  function handleNavigate(row: ConnectionCommunity) {
    if (disabled) return;
    void requestIdentitySwitch(group.identityId, {
      to: "/$communityId",
      params: { communityId: row.identifier },
    });
    onClose();
  }

  function handlePinToggle(row: ConnectionCommunity) {
    const ctx = group.ctx;
    if (!ctx) return;
    void runAction(row.id, () =>
      row.pinned
        ? identityDelete(ctx, `/me/pinned-communities/${row.id}`)
        : identityPost(ctx, "/me/pinned-communities", { communityId: row.id }),
    ).catch(() => undefined);
  }

  return (
    <div
      data-testid="manager-identity-group"
      data-identity-id={group.identityId}
      className={disabled ? "opacity-50" : undefined}
    >
      <ServerChip
        label={group.serverName ?? hostFromOrigin(group.origin)}
        muted={disabled}
        dragHandle={dragHandle}
      />
      {rows.length === 0 ? (
        <p className="px-2 py-1 text-xs text-fg-subtle">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row, i) => (
            <li
              key={row.id}
              draggable={reorderable}
              onDragStart={
                reorderable
                  ? (e) => {
                      if (e.dataTransfer) {
                        e.dataTransfer.setData("text/plain", "");
                        e.dataTransfer.effectAllowed = "move";
                      }
                      dragFromRef.current = i;
                    }
                  : undefined
              }
              onDragOver={
                reorderable
                  ? (e) => {
                      if (dragFromRef.current === null) return;
                      e.preventDefault();
                      if (i !== dragOverIndex) setDragOverIndex(i);
                    }
                  : undefined
              }
              onDrop={reorderable ? () => handleReorderDrop(i) : undefined}
              onDragEnd={
                reorderable
                  ? () => {
                      dragFromRef.current = null;
                      setDragOverIndex(null);
                    }
                  : undefined
              }
              style={{ opacity: dragOverIndex === i ? 0.5 : 1 }}
              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface ${reorderable ? "cursor-move" : ""}`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleNavigate(row)}
                className="flex min-w-0 flex-1 items-center gap-2 truncate text-left text-sm text-fg disabled:cursor-default dark:text-white"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-bold"
                  style={connectionCommunityTileStyle(row)}
                >
                  {row.logoUrl ? (
                    <img src={row.logoUrl} alt={row.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="block cap-trim">{row.name.charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <span className="truncate">{row.name}</span>
              </button>
              <button
                type="button"
                onClick={() => handlePinToggle(row)}
                disabled={disabled || pendingIds.has(row.id)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-50 dark:hover:text-white"
              >
                {row.pinned ? t("manager_unpin") : t("manager_pin")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BrowseOtherPanel({
  groups,
  activeIdentityId,
  onClose,
  registry,
}: {
  groups: ManagerIdentityGroup[];
  activeIdentityId: string | null;
  onClose: () => void;
  registry: ConnectionRegistry;
}) {
  const { t } = useTranslation(["community", "common", "desktop"]);
  const healthyGroups = useMemo(() => groups.filter((g) => g.healthy), [groups]);
  const defaultId = healthyGroups.some((g) => g.identityId === activeIdentityId)
    ? activeIdentityId
    : (healthyGroups[0]?.identityId ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(defaultId);
  const selected = healthyGroups.find((g) => g.identityId === selectedId) ?? null;

  if (healthyGroups.length === 0) {
    return <p className="text-sm text-fg-subtle">{t("manager_other_empty")}</p>;
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 px-2 text-xs font-semibold text-fg-subtle">
        <span>{t("desktop:browse_on_server")}</span>
        <select
          data-testid="manager-browse-select"
          value={selected?.identityId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-fg dark:text-white"
        >
          {healthyGroups.map((g) => (
            <option key={g.identityId} value={g.identityId}>
              {g.serverName ?? hostFromOrigin(g.origin)}
            </option>
          ))}
        </select>
      </label>
      {selected &&
        (selected.identityId === activeIdentityId ? (
          <OtherTab onClose={onClose} />
        ) : (
          <RemoteBrowsePanel key={selected.identityId} group={selected} registry={registry} />
        ))}
    </div>
  );
}

function toBrowseRows(communities: Community[], memberIds: Set<number>): ConnectionCommunity[] {
  return communities
    .filter((c) => !memberIds.has(c.id) && c.isPrivate !== true)
    .map((c) => ({
      id: c.id,
      identifier: c.identifier,
      name: c.name,
      logoUrl: logoUrl(c.logo?.contentUrl ?? null),
      accentColor: c.accentColor,
      iri: c["@id"] ?? null,
      member: false,
      pinned: false,
      isPrivate: c.isPrivate === true,
    }));
}

function RemoteBrowsePanel({
  group,
  registry,
}: {
  group: ManagerIdentityGroup;
  registry: ConnectionRegistry;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const [rows, setRows] = useState<ConnectionCommunity[] | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const memberIds = useMemo(
    () => new Set(group.communities.filter((c) => c.member).map((c) => c.id)),
    [group.communities],
  );

  useEffect(() => {
    const ctx = registry.getConnection(group.identityId)?.serverContext() ?? null;
    if (!ctx) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      return;
    }
    let cancelled = false;
    identityFetch<HydraCollection<Community> | Community[]>(ctx, "/communities")
      .then((payload) => {
        if (cancelled) return;
        setRows(toBrowseRows(unwrapMember(payload), memberIds));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.identityId, registry]);

  async function handleJoin(row: ConnectionCommunity) {
    const ctx = group.ctx;
    if (!ctx) return;
    setPendingIds((prev) => new Set(prev).add(row.id));
    try {
      await identityPost(ctx, `/communities/${row.identifier}/members`, {});
      setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
      notify(t("joined_community", { name: row.name }), "success");
    } catch {
      notify(t("join_failed"), "error");
    } finally {
      await refreshIdentityData(registry, group.identityId);
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  if (rows === null) {
    return <p className="text-sm text-fg-subtle">{t("common:loading")}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-fg-subtle">{t("manager_other_empty")}</p>;
  }

  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-left text-sm text-fg dark:text-white">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-bold"
              style={connectionCommunityTileStyle(row)}
            >
              {row.logoUrl ? (
                <img src={row.logoUrl} alt={row.name} className="h-full w-full object-cover" />
              ) : (
                <span className="block cap-trim">{row.name.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <span className="truncate">{row.name}</span>
          </span>
          <button
            type="button"
            onClick={() => void handleJoin(row)}
            disabled={pendingIds.has(row.id)}
            className="rounded-lg bg-accent-gradient px-3 py-1 text-xs font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {t("join_community")}
          </button>
        </li>
      ))}
    </ul>
  );
}

function CommunityRow({ community: c, onClose }: { community: Community; onClose: () => void }) {
  return (
    <Link
      to="/$communityId"
      params={{ communityId: c.identifier }}
      onClick={onClose}
      className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm text-fg dark:text-white"
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
    </Link>
  );
}
