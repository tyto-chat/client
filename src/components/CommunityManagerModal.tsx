import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Compass, Home, Pin } from "lucide-react";
import { Modal } from "@/components/Modal";
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
import type { Community } from "@/types/api";

type Tab = "pinned" | "your" | "other";

interface Props {
  onClose: () => void;
}

export function CommunityManagerModal({ onClose }: Props) {
  const { t } = useTranslation(["community", "common"]);
  const [tab, setTab] = useState<Tab>("pinned");

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
            {tab === "pinned" && <PinnedTab onClose={close} />}
            {tab === "your" && <YourTab onClose={close} />}
            {tab === "other" && <OtherTab onClose={close} />}
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
          onDragStart={() => {
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
