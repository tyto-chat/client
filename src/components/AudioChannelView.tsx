import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useAuthModal } from "@/context/AuthModalContext";
import { useTranslation } from "react-i18next";
import { fetchLiveKitToken } from "@/api/livekit";
import { getServerInfo } from "@/api/serverInfo";
import { useChannelParticipantsQuery } from "@/hooks/useChannelParticipants";
import { useAudioCall } from "@/context/AudioCallContext";
import { formatKey } from "@/utils/voiceSettings";
import { useAuth } from "@/hooks/useAuth";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/api/client";
import { AudioSliders } from "@/components/AudioSliders";
import {
  MicrophoneIcon,
  MicOffIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  PhoneOffIcon,
  VideoIcon,
  VideoOffIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  SettingsSlidersIcon,
} from "@/components/icons";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { Channel } from "@/types/api";
import type { LocalVideoTrack } from "livekit-client";
import type { BackgroundProcessorWrapper } from "@livekit/track-processors";
import { DeviceSelect } from "@/components/DeviceSelect";
import { BlurLevelPicker } from "@/components/BlurLevelPicker";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { usePreferredDevice } from "@/utils/deviceSettings";
import {
  BLUR_RADII,
  MEDIAPIPE_ASSET_PATHS,
  setJoinMuted,
  setJoinWithCamera,
  useBackgroundBlur,
  useJoinMuted,
  useJoinWithCamera,
  useMirrorSelf,
} from "@/utils/mediaEffects";

function CallSettingsButton({ cameraActive }: { cameraActive: boolean }) {
  const { t } = useTranslation(["channel", "settings"]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const devices = useMediaDevices(open);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t("channel:call_settings")}
        aria-expanded={open}
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          open
            ? "bg-raised text-fg ring-1 ring-inset ring-line-strong"
            : "bg-surface text-fg-muted ring-1 ring-inset ring-line hover:bg-raised hover:text-fg"
        }`}
      >
        <SettingsSlidersIcon />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 flex w-72 -translate-x-1/2 flex-col gap-3 rounded-xl border border-line bg-overlay p-3 text-left shadow-soft-md">
          <DeviceSelect
            kind="audioinput"
            mediaKind="audioinput"
            label={t("settings:device_microphone")}
            devices={devices}
          />
          <DeviceSelect
            kind="audiooutput"
            mediaKind="audiooutput"
            label={t("settings:device_speaker")}
            devices={devices}
          />
          <DeviceSelect
            kind="videoinput"
            mediaKind="videoinput"
            label={t("settings:device_camera")}
            devices={devices}
          />
          <AudioSliders />
          {cameraActive && (
            <div>
              <p className="mb-1 text-xs text-fg-muted">{t("settings:background_blur")}</p>
              <BlurLevelPicker />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function VoiceControls() {
  const { t } = useTranslation(["channel", "auth"]);
  const {
    voiceMode,
    pttKey,
    isPttActive,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    leave,
    isCameraEnabled,
    isScreenShareEnabled,
    setCameraEnabled,
    setScreenShareEnabled,
  } = useAudioCall();
  const micMuted = voiceMode === "open" ? isMuted : !isPttActive;

  const dockBtn = "flex h-11 w-11 items-center justify-center rounded-full transition-colors";
  const dockIdle =
    "bg-surface text-fg-muted ring-1 ring-inset ring-line hover:bg-raised hover:text-fg";
  const dockDanger = "bg-danger/15 text-danger ring-1 ring-inset ring-danger/30";
  const dockOn = "bg-surface text-fg ring-1 ring-inset ring-line hover:bg-raised";
  const dockLive =
    "bg-green-500/15 text-green-600 ring-1 ring-inset ring-green-500/30 dark:text-green-400";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2">
      {voiceMode === "ptt" && (
        <span
          className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            isPttActive
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-overlay/90 text-fg-muted"
          }`}
        >
          {isPttActive ? t("ptt_live") : t("ptt_hold", { key: formatKey(pttKey) })}
        </span>
      )}

      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-overlay/90 px-3 py-2 shadow-soft-md backdrop-blur-md">
        {voiceMode === "open" && (
          <button
            onClick={toggleMute}
            title={micMuted ? t("unmute") : t("mute")}
            className={`${dockBtn} ${micMuted ? dockDanger : dockOn}`}
          >
            {micMuted ? <MicOffIcon /> : <MicrophoneIcon size={18} />}
          </button>
        )}

        <button
          onClick={toggleDeafen}
          title={isDeafened ? t("undeafen") : t("deafen")}
          className={`${dockBtn} ${isDeafened ? dockDanger : dockOn}`}
        >
          {isDeafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
        </button>

        <span className="mx-0.5 h-6 w-px bg-line" />

        <button
          onClick={() => setCameraEnabled(!isCameraEnabled)}
          title={isCameraEnabled ? t("camera_off") : t("camera_on")}
          className={`${dockBtn} ${isCameraEnabled ? dockLive : dockIdle}`}
        >
          {isCameraEnabled ? <VideoIcon /> : <VideoOffIcon />}
        </button>
        <button
          onClick={() => setScreenShareEnabled(!isScreenShareEnabled)}
          title={isScreenShareEnabled ? t("screen_share_off") : t("screen_share_on")}
          className={`${dockBtn} ${isScreenShareEnabled ? dockLive : dockIdle}`}
        >
          {isScreenShareEnabled ? <ScreenShareIcon /> : <ScreenShareOffIcon />}
        </button>

        <span className="mx-0.5 h-6 w-px bg-line" />

        <CallSettingsButton cameraActive={isCameraEnabled} />

        <button
          onClick={leave}
          title={t("leave_call")}
          className={`${dockBtn} bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.4)] hover:bg-red-600`}
        >
          <PhoneOffIcon />
        </button>
      </div>
    </div>
  );
}

function PreJoinCameraPreview({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation(["channel", "settings"]);
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraDevice = usePreferredDevice("videoinput");
  const blur = useBackgroundBlur();
  const mirrorSelf = useMirrorSelf();
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);
  const [failed, setFailed] = useState(false);
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let created: LocalVideoTrack | undefined;
    void (async () => {
      try {
        const { createLocalVideoTrack } = await import("livekit-client");
        created = await createLocalVideoTrack({ deviceId: cameraDevice || undefined });
        if (cancelled) {
          created.stop();
          return;
        }
        setFailed(false);
        setTrack(created);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      processorRef.current = null;
      if (created) {
        void created.stopProcessor().catch(() => {});
        created.stop();
      }
      setTrack(null);
    };
  }, [cameraDevice, enabled]);

  useEffect(() => {
    const el = videoRef.current;
    if (!track || !el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track, failed]);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    void (async () => {
      const { BackgroundProcessor, supportsBackgroundProcessors } =
        await import("@livekit/track-processors");
      if (cancelled) return;
      if (blur !== "off" && supportsBackgroundProcessors()) {
        const blurRadius = BLUR_RADII[blur];
        if (!processorRef.current) {
          const processor = BackgroundProcessor({
            mode: "background-blur",
            blurRadius,
            assetPaths: MEDIAPIPE_ASSET_PATHS,
          });
          processorRef.current = processor;
          await track.setProcessor(processor).catch(() => {
            processorRef.current = null;
          });
        } else {
          await processorRef.current
            .switchTo({ mode: "background-blur", blurRadius })
            .catch(() => {});
        }
      } else if (track.getProcessor()) {
        await track.stopProcessor().catch(() => {});
        processorRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track, blur]);

  return (
    <div className="w-full">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {!enabled ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black/90 pb-8">
            <Avatar
              name={user?.profile?.name ?? "?"}
              colorKey={user?.profile?.["@id"] ?? "me"}
              imageUrl={avatarUrl(user?.profile?.avatar?.contentUrl ?? null, "md")}
              size="lg"
            />
            <span className="text-sm text-white/75">{user?.profile?.name}</span>
          </div>
        ) : failed ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-fg-muted">
            {t("channel:camera_preview_failed")}
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-cover ${mirrorSelf ? "-scale-x-100" : ""}`}
          />
        )}
        <PreJoinOverlayControls />
      </div>
      <div
        className={`mt-2 text-left transition-opacity ${enabled ? "" : "pointer-events-none opacity-40"}`}
        aria-disabled={!enabled}
      >
        <p className="mb-1 text-xs text-fg-muted">{t("settings:background_blur")}</p>
        <BlurLevelPicker />
      </div>
    </div>
  );
}

function PreJoinOverlayControls() {
  const { t } = useTranslation("channel");
  const joinMuted = useJoinMuted();
  const joinWithCamera = useJoinWithCamera();

  const btn =
    "flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-colors";
  const live = "border-white/15 bg-black/55 text-white hover:bg-black/70";
  const off = "border-danger/40 bg-danger/80 text-white hover:bg-danger";

  return (
    <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-2">
      <button
        type="button"
        onClick={() => setJoinMuted(!joinMuted)}
        aria-pressed={joinMuted}
        title={joinMuted ? t("join_mic_muted") : t("join_mic_live")}
        className={`${btn} ${joinMuted ? off : live}`}
      >
        {joinMuted ? <MicOffIcon size={15} /> : <MicrophoneIcon size={15} />}
      </button>
      <button
        type="button"
        onClick={() => setJoinWithCamera(!joinWithCamera)}
        aria-pressed={joinWithCamera}
        title={joinWithCamera ? t("join_camera_on") : t("join_camera_off")}
        className={`${btn} ${joinWithCamera ? live : off}`}
      >
        {joinWithCamera ? <VideoIcon size={15} /> : <VideoOffIcon size={15} />}
      </button>
    </div>
  );
}

function PreJoinSettings() {
  const { t } = useTranslation(["channel", "settings"]);
  const joinWithCamera = useJoinWithCamera();
  const devices = useMediaDevices(true);

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <PreJoinCameraPreview enabled={joinWithCamera} />
      <div className="flex gap-2">
        <DeviceSelect
          kind="audioinput"
          mediaKind="audioinput"
          label={t("settings:device_microphone")}
          devices={devices}
          compact
          icon={<MicrophoneIcon size={13} />}
        />
        <DeviceSelect
          kind="audiooutput"
          mediaKind="audiooutput"
          label={t("settings:device_speaker")}
          devices={devices}
          compact
          icon={<HeadphonesIcon size={13} />}
        />
      </div>
      <div
        className={`flex transition-opacity ${joinWithCamera ? "" : "pointer-events-none opacity-40"}`}
        aria-disabled={!joinWithCamera}
      >
        <DeviceSelect
          kind="videoinput"
          mediaKind="videoinput"
          label={t("settings:device_camera")}
          devices={devices}
          compact
          icon={<VideoIcon size={13} />}
        />
      </div>
    </div>
  );
}

interface Props {
  channel: Channel;
}

export function AudioChannelView({ channel }: Props) {
  const { t } = useTranslation(["channel", "auth"]);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { token } = useAuth();
  const { openLogin, openRegister } = useAuthModal();
  const { activeCall, join, setCallSlot } = useAudioCall();
  const joinMuted = useJoinMuted();
  const isInThisCall = activeCall?.channel.identifier === channel.identifier;
  const isInAnotherCall = !!activeCall && !isInThisCall;
  const { communityId } = useParams({ strict: false }) as { communityId: string };
  const { data: participants = [] } = useChannelParticipantsQuery(communityId, channel.identifier);

  async function handleJoin() {
    setJoining(true);
    setError(null);
    try {
      const [resp] = await Promise.all([
        fetchLiveKitToken(communityId, channel.identifier),
        import("@/components/LiveKitRoomContent"),
      ]);
      const liveKitUrl = getServerInfo()?.liveKitUrl ?? "";
      join(resp.token, channel, communityId, liveKitUrl);
    } catch {
      setError(t("voice_no_connect"));
    } finally {
      setJoining(false);
    }
  }

  if (isInThisCall) {
    return (
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div ref={(el) => setCallSlot(el)} className="flex flex-1 flex-col overflow-hidden" />
        <VoiceControls />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:items-center md:justify-center md:p-8">
      <div className="flex min-h-0 w-full flex-1 flex-col bg-surface md:max-w-sm md:flex-none md:rounded-2xl md:border md:border-line md:shadow-soft-lg">
        <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto p-6 text-center md:gap-6 md:p-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent md:h-16 md:w-16">
            <HeadphonesIcon size={28} />
          </span>

          <div>
            <h2 className="text-xl font-semibold text-fg">{channel.name}</h2>
            {channel.description && (
              <p className="mt-1 text-sm text-fg-muted">{channel.description}</p>
            )}
          </div>

          {participants.length > 0 ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex -space-x-2">
                {participants.slice(0, 5).map((p) => (
                  <Avatar
                    key={p.id}
                    name={p.profile.name}
                    colorKey={p.profile["@id"]}
                    imageUrl={avatarUrl(p.profile.avatar?.contentUrl ?? null, "sm")}
                    size="sm"
                    className="rounded-full ring-2 ring-surface"
                  />
                ))}
                {participants.length > 5 && (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-raised text-xs font-semibold text-fg-muted ring-2 ring-surface">
                    +{participants.length - 5}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-fg-muted">
                {t("people_in_voice", { count: participants.length })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">{t("voice_empty_hint")}</p>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          {token ? (
            <PreJoinSettings />
          ) : (
            <div className="flex w-full flex-col items-center gap-3">
              <p className="text-sm text-fg-muted">{t("guest_voice_prompt")}</p>
              <div className="flex w-full gap-2">
                <button
                  onClick={openLogin}
                  className="flex-1 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-fg transition hover:bg-raised"
                >
                  {t("auth:sign_in")}
                </button>
                <button
                  onClick={openRegister}
                  className="flex-1 rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
                >
                  {t("auth:create_account")}
                </button>
              </div>
            </div>
          )}
        </div>

        {token && (
          <div className="flex flex-none flex-col items-center gap-2 border-t border-line bg-surface/95 p-4 backdrop-blur-md md:border-0 md:bg-transparent md:px-8 md:pb-8 md:pt-0">
            {isInAnotherCall && <p className="text-xs text-fg-muted">{t("already_in_call")}</p>}
            <button
              onClick={handleJoin}
              disabled={joining || isInAnotherCall}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-gradient px-5 py-3 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <HeadphonesIcon size={16} />
              {joining ? t("connecting") : joinMuted ? t("join_voice_muted") : t("join_voice")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
