import { useTracks, VideoTrack, isTrackReference } from "@livekit/components-react";
import { Track } from "livekit-client";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { useTranslation } from "react-i18next";
import { useAudioCall } from "@/context/AudioCallContext";
import { useSpeakingUsers } from "@/utils/speakingUsers";
import { useChannelParticipantsQuery } from "@/hooks/useChannelParticipants";
import { Avatar } from "@/components/Avatar";
import { MaximizeIcon, MicOffIcon, ScreenShareIcon } from "@/components/icons";
import { avatarUrl } from "@/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useMirrorSelf } from "@/utils/mediaEffects";
import { selectVoiceLayout, type VoiceTile } from "@/utils/voiceLayout";
import type { ChannelParticipant } from "@/types/api";

function userIdFromIdentity(identity: string): number {
  return identity.startsWith("user-") ? parseInt(identity.slice(5), 10) : 0;
}

function toTile(ref: TrackReferenceOrPlaceholder): VoiceTile {
  const p = ref.participant;
  const kind: VoiceTile["kind"] = !isTrackReference(ref)
    ? "avatar"
    : ref.source === Track.Source.ScreenShare
      ? "screen"
      : "camera";
  return {
    sid: isTrackReference(ref) ? ref.publication.trackSid : "ph-" + p.identity,
    kind,
    userId: userIdFromIdentity(p.identity),
    name: p.name || p.identity,
  };
}

export function VideoTileGrid() {
  const { t } = useTranslation("channel");
  const { activeCall } = useAudioCall();
  const { user } = useAuth();
  const mirrorSelf = useMirrorSelf();
  const speakingUserIds = useSpeakingUsers();
  const { data: participants = [] } = useChannelParticipantsQuery(
    activeCall?.communityId ?? "",
    activeCall?.channel.identifier ?? "",
  );
  const profileByUserId = new Map<number, ChannelParticipant>();
  for (const p of participants) profileByUserId.set(p.userId, p);

  const trackRefs = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const refBySid = new Map<string, TrackReferenceOrPlaceholder>();
  for (const ref of trackRefs) refBySid.set(toTile(ref).sid, ref);

  const layout = selectVoiceLayout(trackRefs.map(toTile));

  function toggleTileFullscreen(e: React.MouseEvent) {
    const el = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-voice-tile]");
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  }

  function tileBody(tile: VoiceTile) {
    const ref = refBySid.get(tile.sid);
    const speaking = speakingUserIds.has(tile.userId) && tile.kind !== "screen";
    const speakingClass = speaking
      ? "ring-2 ring-green-500 shadow-[0_0_18px_rgba(34,197,94,0.35)]"
      : "";
    const participant = profileByUserId.get(tile.userId);
    const displayName = participant?.profile.name ?? tile.name;
    const micMuted = tile.kind !== "screen" && ref?.participant.isMicrophoneEnabled === false;
    if (ref && isTrackReference(ref) && !ref.publication.isMuted && tile.kind !== "avatar") {
      return (
        <div
          data-voice-tile
          className={`group/tile relative h-full w-full overflow-hidden rounded-lg bg-black ${speakingClass}`}
        >
          <VideoTrack
            trackRef={ref}
            className={`h-full w-full object-cover ${
              mirrorSelf && tile.kind === "camera" && tile.userId === user?.id ? "-scale-x-100" : ""
            }`}
          />
          <span className="absolute bottom-1 left-2 flex items-center gap-1.5 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white backdrop-blur-sm">
            <Avatar
              name={displayName}
              colorKey={participant?.profile["@id"] ?? tile.name}
              imageUrl={avatarUrl(participant?.profile.avatar?.contentUrl ?? null)}
              size="xs"
            />
            {tile.kind === "screen" ? t("screen_share_label", { name: displayName }) : displayName}
            {micMuted && <MicOffIcon size={11} className="text-red-400" />}
          </span>
          {tile.kind === "screen" && (
            <>
              <span className="absolute left-2 top-1.5 flex items-center gap-1.5 rounded-full bg-[var(--accent)]/30 px-2 py-0.5 text-[0.6875rem] font-semibold text-white backdrop-blur-sm">
                <ScreenShareIcon size={11} />
                {t("presenting", { name: displayName })}
              </span>
              <button
                type="button"
                onClick={toggleTileFullscreen}
                title={t("screen_share_fullscreen")}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/tile:opacity-100"
              >
                <MaximizeIcon size={14} />
              </button>
            </>
          )}
        </div>
      );
    }
    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg bg-surface ${speakingClass}`}
      >
        <Avatar
          name={displayName}
          colorKey={participant?.profile["@id"] ?? tile.name}
          imageUrl={avatarUrl(participant?.profile.avatar?.contentUrl ?? null, "md")}
          size="lg"
        />
        <span className="flex items-center gap-1.5 text-sm text-fg">
          {displayName}
          {micMuted && <MicOffIcon size={12} className="text-danger" />}
        </span>
      </div>
    );
  }

  if (layout.tiles.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-fg-muted" />;
  }

  if (layout.mode === "spotlight" && layout.spotlightSid) {
    const spot = layout.tiles.find((t) => t.sid === layout.spotlightSid)!;
    const rest = layout.tiles.filter((t) => t.sid !== layout.spotlightSid);
    return (
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
        <div className="min-h-0 flex-1">{tileBody(spot)}</div>
        {rest.length > 0 && (
          <div className="flex h-24 shrink-0 gap-3 overflow-x-auto">
            {rest.map((t) => (
              <div key={t.sid} className="aspect-video h-full shrink-0">
                {tileBody(t)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 overflow-y-auto p-4 md:grid-cols-3">
      {layout.tiles.map((t) => (
        <div key={t.sid} className="aspect-video">
          {tileBody(t)}
        </div>
      ))}
    </div>
  );
}
