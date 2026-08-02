import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/api/client";
import { useAudioCall } from "@/context/AudioCallContext";
import { useSpeakingUsers } from "@/utils/speakingUsers";
import { useAuth } from "@/hooks/useAuth";
import { useClickOutside } from "@/hooks/useClickOutside";
import { MicOffIcon, VolumeIcon, VolumeMutedIcon } from "@/components/icons";
import { setMemberMuted, setMemberVolume, useMemberAudio } from "@/utils/memberAudio";
import type { ChannelParticipant } from "@/types/api";

interface Props {
  participants: ChannelParticipant[];
  channelIdentifier?: string;
}

function MemberAudioControls({ userId, name }: { userId: number; name: string }) {
  const { t } = useTranslation("channel");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const { muted, volume } = useMemberAudio(userId);

  return (
    <div ref={ref} className="relative ml-auto flex shrink-0 items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={t("member_audio_title", { name })}
        aria-expanded={open}
        className={`flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-raised ${
          muted
            ? "text-danger opacity-100"
            : "text-fg-subtle opacity-0 group-hover/prow:opacity-100"
        } ${open ? "opacity-100" : ""}`}
      >
        {muted ? <VolumeMutedIcon size={12} /> : <VolumeIcon size={12} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-line bg-overlay p-3 shadow-soft-md">
          <button
            type="button"
            onClick={() => setMemberMuted(userId, !muted)}
            aria-pressed={muted}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              muted
                ? "border-danger/30 bg-danger/15 text-danger"
                : "border-line bg-surface text-fg hover:bg-raised"
            }`}
          >
            {muted ? <VolumeMutedIcon size={12} /> : <VolumeIcon size={12} />}
            {muted ? t("member_unmute") : t("member_mute")}
          </button>
          <div className={`mt-2 ${muted ? "pointer-events-none opacity-40" : ""}`}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-fg-muted">{t("member_volume")}</span>
              <span className="text-xs tabular-nums text-fg-subtle">{volume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setMemberVolume(userId, Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>
          <p className="mt-2 text-[0.625rem] leading-snug text-fg-subtle">
            {t("member_audio_hint")}
          </p>
        </div>
      )}
    </div>
  );
}

export function ChannelParticipantsList({ participants, channelIdentifier }: Props) {
  const { activeCall, isMuted } = useAudioCall();
  const speakingUserIds = useSpeakingUsers();
  const { user } = useAuth();
  const inThisCall =
    channelIdentifier !== undefined && activeCall?.channel.identifier === channelIdentifier;

  if (participants.length === 0) return null;

  return (
    <ul className="mt-0.5 ml-7 mb-1 space-y-0.5">
      {participants.map((p) => (
        <li key={p.id} className="group/prow flex items-center gap-1.5 text-xs text-fg-muted">
          <div
            className={`flex rounded-full transition-shadow ${speakingUserIds.has(p.userId) ? "ring-2 ring-green-500 ring-offset-1 ring-offset-rail" : ""}`}
          >
            <Avatar
              name={p.profile.name}
              colorKey={p.profile["@id"]}
              imageUrl={avatarUrl(p.profile.avatar?.contentUrl ?? null)}
              size="xxs"
            />
          </div>
          <span className="truncate">{p.profile.name}</span>
          {inThisCall && isMuted && p.userId === user?.id && (
            <MicOffIcon size={11} className="ml-auto shrink-0 text-danger" />
          )}
          {inThisCall && p.userId !== user?.id && (
            <MemberAudioControls userId={p.userId} name={p.profile.name} />
          )}
        </li>
      ))}
    </ul>
  );
}
