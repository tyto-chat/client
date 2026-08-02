import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  AudioTrack,
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { getPreferredDevice, usePreferredDevice } from "@/utils/deviceSettings";
import type { DeviceKind } from "@/utils/deviceSettings";
import {
  BLUR_RADII,
  MEDIAPIPE_ASSET_PATHS,
  getJoinMuted,
  getJoinWithCamera,
  getMicGain,
  getNoiseSuppression,
  useBackgroundBlur,
  useMicGain,
  useNoiseSuppression,
  useOutputVolume,
} from "@/utils/mediaEffects";
import { createMicGainProcessor, type MicGainProcessor } from "@/utils/micGainProcessor";
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
  type BackgroundProcessorWrapper,
} from "@livekit/track-processors";
import { LocalAudioTrack, LocalVideoTrack, Track } from "livekit-client";
import { VideoTileGrid } from "@/components/VideoTileGrid";
import { useMemberAudioStore } from "@/utils/memberAudio";
import { setSpeakingUsers } from "@/utils/speakingUsers";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAudioCall } from "@/context/AudioCallContext";
import { useNotification } from "@/context/NotificationContext";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/queries/queryKeys";
import type { ChannelParticipant } from "@/types/api";

function MicHandler() {
  const { voiceMode, pttKey, setIsPttActive, isMuted } = useAudioCall();
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (voiceMode === "ptt") {
      setIsPttActive(false);
      void localParticipant.setMicrophoneEnabled(false);
    } else {
      setIsPttActive(false);
      void localParticipant.setMicrophoneEnabled(true);
    }
  }, [voiceMode, localParticipant, setIsPttActive]);

  useEffect(() => {
    if (voiceMode !== "open") return;
    void localParticipant.setMicrophoneEnabled(!isMuted);
  }, [voiceMode, isMuted, localParticipant]);

  useEffect(() => {
    if (voiceMode !== "ptt") return;

    function isTypingTarget(e: KeyboardEvent): boolean {
      const target = e.target as HTMLElement;
      return (
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.key !== pttKey || isTypingTarget(e)) return;
      setIsPttActive(true);
      void localParticipant.setMicrophoneEnabled(true);
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key !== pttKey || isTypingTarget(e)) return;
      setIsPttActive(false);
      void localParticipant.setMicrophoneEnabled(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      setIsPttActive(false);
    };
  }, [voiceMode, pttKey, localParticipant, setIsPttActive]);

  return null;
}

function SpeakingStateSync() {
  const lkParticipants = useParticipants();

  useEffect(() => {
    setSpeakingUsers(
      new Set(
        lkParticipants
          .filter((p) => p.isSpeaking && p.identity.startsWith("user-"))
          .map((p) => parseInt(p.identity.slice(5), 10)),
      ),
    );
  }, [lkParticipants]);

  return null;
}

function MediaControlSync({
  processorRef,
}: {
  processorRef: React.MutableRefObject<BackgroundProcessorWrapper | null>;
}) {
  const { localParticipant } = useLocalParticipant();
  const { registerMediaControls, setMediaEnabledState } = useAudioCall();
  const { notify } = useNotification();
  const { t } = useTranslation("channel");
  const blur = useBackgroundBlur();
  const blurRef = useRef(blur);
  useEffect(() => {
    blurRef.current = blur;
  }, [blur]);

  useEffect(() => {
    const resync = () =>
      setMediaEnabledState({
        camera: localParticipant.isCameraEnabled,
        screen: localParticipant.isScreenShareEnabled,
      });
    registerMediaControls({
      setCameraEnabled: (on) => {
        const blurLevel = blurRef.current;
        const onError = () => {
          notify(t("voice_video_error"), "error");
          resync();
        };
        if (on && blurLevel !== "off" && supportsBackgroundProcessors()) {
          const blurRadius = BLUR_RADII[blurLevel];
          if (!processorRef.current) {
            processorRef.current = BackgroundProcessor({
              mode: "background-blur",
              blurRadius,
              assetPaths: MEDIAPIPE_ASSET_PATHS,
            });
          } else {
            void processorRef.current
              .switchTo({ mode: "background-blur", blurRadius })
              .catch(() => {});
          }
          void localParticipant
            .setCameraEnabled(on, { processor: processorRef.current })
            .catch(onError);
          return;
        }
        void localParticipant.setCameraEnabled(on).catch(onError);
      },
      setScreenShareEnabled: (on) => {
        void localParticipant.setScreenShareEnabled(on, { audio: true }).catch(() => {
          if (on) notify(t("voice_screen_error"), "error");
          resync();
        });
      },
    });
  }, [localParticipant, registerMediaControls, setMediaEnabledState, notify, t, processorRef]);

  useEffect(() => {
    const sync = () =>
      setMediaEnabledState({
        camera: localParticipant.isCameraEnabled,
        screen: localParticipant.isScreenShareEnabled,
      });
    sync();
    localParticipant.on("localTrackPublished", sync);
    localParticipant.on("localTrackUnpublished", sync);
    return () => {
      localParticipant.off("localTrackPublished", sync);
      localParticipant.off("localTrackUnpublished", sync);
    };
  }, [localParticipant, setMediaEnabledState]);

  return null;
}

function EffectsSync({
  processorRef,
}: {
  processorRef: React.MutableRefObject<BackgroundProcessorWrapper | null>;
}) {
  const blur = useBackgroundBlur();
  const noiseSuppression = useNoiseSuppression();
  const { cameraTrack, microphoneTrack } = useLocalParticipant();
  const lastNoiseSuppressionRef = useRef<boolean | null>(null);

  useEffect(() => {
    const track = cameraTrack?.track;
    if (!(track instanceof LocalVideoTrack)) return;
    if (blur !== "off" && supportsBackgroundProcessors()) {
      const blurRadius = BLUR_RADII[blur];
      if (!processorRef.current) {
        processorRef.current = BackgroundProcessor({
          mode: "background-blur",
          blurRadius,
          assetPaths: MEDIAPIPE_ASSET_PATHS,
        });
      }
      if (track.getProcessor() !== processorRef.current) {
        void track.setProcessor(processorRef.current).catch(() => {
          processorRef.current = null;
        });
      }
      void processorRef.current.switchTo({ mode: "background-blur", blurRadius }).catch(() => {});
    } else if (track.getProcessor()) {
      void track.stopProcessor().catch(() => {});
    }
  }, [cameraTrack, blur, processorRef]);

  useEffect(() => {
    const track = microphoneTrack?.track;
    if (!(track instanceof LocalAudioTrack)) return;
    if (lastNoiseSuppressionRef.current === null) {
      lastNoiseSuppressionRef.current = noiseSuppression;
      return;
    }
    if (lastNoiseSuppressionRef.current === noiseSuppression) return;
    lastNoiseSuppressionRef.current = noiseSuppression;
    void track.restartTrack({ noiseSuppression, echoCancellation: true }).catch(() => {});
  }, [microphoneTrack, noiseSuppression]);

  const micGain = useMicGain();
  const gainProcessorRef = useRef<MicGainProcessor | null>(null);

  useEffect(() => {
    const track = microphoneTrack?.track;
    if (!(track instanceof LocalAudioTrack)) return;
    if (!gainProcessorRef.current) {
      gainProcessorRef.current = createMicGainProcessor(getMicGain());
    }
    if (track.getProcessor() !== gainProcessorRef.current) {
      void track.setProcessor(gainProcessorRef.current).catch(() => {
        gainProcessorRef.current = null;
      });
    }
  }, [microphoneTrack]);

  useEffect(() => {
    gainProcessorRef.current?.setGain(micGain);
  }, [micGain]);

  return null;
}

function DeviceSync() {
  const room = useRoomContext();
  const mic = usePreferredDevice("audioinput");
  const output = usePreferredDevice("audiooutput");
  const camera = usePreferredDevice("videoinput");

  useEffect(() => {
    const apply = (kind: DeviceKind, id: string) => {
      if (id) void room.switchActiveDevice(kind, id).catch(() => {});
    };
    apply("audioinput", mic);
    apply("audiooutput", output);
    apply("videoinput", camera);
  }, [room, mic, output, camera]);

  return null;
}

function CallAudioRenderer() {
  const outputVolume = useOutputVolume();
  const memberAudio = useMemberAudioStore();
  const tracks = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio], {
    onlySubscribed: true,
  }).filter((ref) => !ref.participant.isLocal && ref.publication.kind === Track.Kind.Audio);

  return (
    <>
      {tracks.map((trackRef) => {
        const identity = trackRef.participant.identity;
        const userId = identity.startsWith("user-") ? parseInt(identity.slice(5), 10) : NaN;
        const member = memberAudio.get(userId);
        const volume =
          member?.muted === true ? 0 : (outputVolume / 100) * ((member?.volume ?? 100) / 100);
        return (
          <AudioTrack
            key={`${trackRef.participant.identity}-${trackRef.publication.trackSid}`}
            trackRef={trackRef}
            volume={volume}
          />
        );
      })}
    </>
  );
}

export function LiveKitRoomContent() {
  const { activeCall, leave, voiceMode, isDeafened, callSlot } = useAudioCall();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const blurProcessorRef = useRef<BackgroundProcessorWrapper | null>(null);
  function handleConnected() {
    if (!user || !activeCall) return;
    const self: ChannelParticipant = {
      "@id": user["@id"],
      "@type": "ChannelParticipant",
      id: user.id,
      userId: user.id,
      profile: user.profile,
      joinedAt: new Date().toISOString(),
    };
    queryClient.setQueryData(
      queryKeys.channelParticipants(activeCall.communityId, activeCall.channel.identifier),
      (old: ChannelParticipant[] = []) =>
        old.some((p) => p.userId === user.id) ? old : [...old, self],
    );
  }

  function handleDisconnected() {
    leave();
  }

  return (
    <LiveKitRoom
      token={activeCall!.token}
      serverUrl={activeCall!.liveKitUrl}
      audio={voiceMode !== "ptt" && !getJoinMuted()}
      video={getJoinWithCamera()}
      options={{
        audioCaptureDefaults: {
          deviceId: getPreferredDevice("audioinput") || undefined,
          noiseSuppression: getNoiseSuppression(),
          echoCancellation: true,
        },
        videoCaptureDefaults: { deviceId: getPreferredDevice("videoinput") || undefined },
        audioOutput: { deviceId: getPreferredDevice("audiooutput") || undefined },
      }}
      onConnected={handleConnected}
      onDisconnected={handleDisconnected}
      style={{ display: "contents" }}
    >
      {!isDeafened && <CallAudioRenderer />}
      <SpeakingStateSync />
      <MicHandler />
      <MediaControlSync processorRef={blurProcessorRef} />
      <DeviceSync />
      <EffectsSync processorRef={blurProcessorRef} />
      {callSlot && createPortal(<VideoTileGrid />, callSlot)}
    </LiveKitRoom>
  );
}
