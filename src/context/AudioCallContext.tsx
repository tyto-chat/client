/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type React from "react";
import type { Channel } from "@/types/api";
import { getActiveIdentityKey } from "@/platform/activeIdentity";
import type { VoiceMode } from "@/utils/voiceSettings";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { getJoinMuted } from "@/utils/mediaEffects";
import { resetMemberAudio } from "@/utils/memberAudio";
import { resetSpeakingUsers } from "@/utils/speakingUsers";

interface VoiceSettings {
  mode: VoiceMode;
  pttKey: string;
}

interface AudioCallState {
  token: string;
  channel: Channel;
  communityId: string;
  liveKitUrl: string;
  identityKey?: string | null;
}

interface AudioCallContextValue {
  activeCall: AudioCallState | null;
  join: (token: string, channel: Channel, communityId: string, liveKitUrl: string) => void;
  leave: () => void;
  voiceMode: VoiceMode;
  pttKey: string;
  setVoiceMode: (mode: VoiceMode) => void;
  setPttKey: (key: string) => void;
  isPttActive: boolean;
  setIsPttActive: (active: boolean) => void;
  isMuted: boolean;
  isDeafened: boolean;
  toggleMute: () => void;
  toggleDeafen: () => void;
  micLevelRef: React.MutableRefObject<number>;
  callSlot: HTMLElement | null;
  setCallSlot: (el: HTMLElement | null) => void;
  isCameraEnabled: boolean;
  isScreenShareEnabled: boolean;
  setCameraEnabled: (on: boolean) => void;
  setScreenShareEnabled: (on: boolean) => void;
  registerMediaControls: (controls: {
    setCameraEnabled: (on: boolean) => void;
    setScreenShareEnabled: (on: boolean) => void;
  }) => void;
  setMediaEnabledState: (state: { camera: boolean; screen: boolean }) => void;
}

const AudioCallContext = createContext<AudioCallContextValue | null>(null);

const CALL_STORAGE_KEY = STORAGE_KEYS.ACTIVE_CALL;
const VOICE_SETTINGS_KEY = STORAGE_KEYS.VOICE_SETTINGS;
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  mode: "open",
  pttKey: " ",
};

function loadActiveCall(): AudioCallState | null {
  try {
    const raw = sessionStorage.getItem(CALL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AudioCallState) : null;
  } catch {
    return null;
  }
}

function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    const stored = JSON.parse(raw) as Partial<VoiceSettings> & { mode?: string };
    return {
      mode: stored.mode === "ptt" ? "ptt" : "open",
      pttKey: stored.pttKey ?? DEFAULT_VOICE_SETTINGS.pttKey,
    };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function AudioCallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCall] = useState<AudioCallState | null>(loadActiveCall);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(loadVoiceSettings);
  const [isPttActive, setIsPttActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const micLevelRef = useRef<number>(0);
  const [callSlot, setCallSlot] = useState<HTMLElement | null>(null);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenShareEnabled, setIsScreenShareEnabled] = useState(false);
  const mediaControlsRef = useRef<{
    setCameraEnabled: (on: boolean) => void;
    setScreenShareEnabled: (on: boolean) => void;
  } | null>(null);

  const registerMediaControls = useCallback(
    (controls: {
      setCameraEnabled: (on: boolean) => void;
      setScreenShareEnabled: (on: boolean) => void;
    }) => {
      mediaControlsRef.current = controls;
    },
    [],
  );
  const setMediaEnabledState = useCallback((s: { camera: boolean; screen: boolean }) => {
    setIsCameraEnabled(s.camera);
    setIsScreenShareEnabled(s.screen);
  }, []);
  const setCameraEnabled = useCallback((on: boolean) => {
    setIsCameraEnabled(on);
    mediaControlsRef.current?.setCameraEnabled(on);
  }, []);
  const setScreenShareEnabled = useCallback((on: boolean) => {
    setIsScreenShareEnabled(on);
    mediaControlsRef.current?.setScreenShareEnabled(on);
  }, []);

  const join = useCallback(
    (token: string, channel: Channel, communityId: string, liveKitUrl: string) => {
      const state = {
        token,
        channel,
        communityId,
        liveKitUrl,
        identityKey: getActiveIdentityKey(),
      };
      sessionStorage.setItem(CALL_STORAGE_KEY, JSON.stringify(state));
      setActiveCall(state);
      setIsMuted(getJoinMuted());
    },
    [],
  );

  const leave = useCallback(() => {
    sessionStorage.removeItem(CALL_STORAGE_KEY);
    setActiveCall(null);
    resetSpeakingUsers();
    setIsMuted(false);
    setIsDeafened(false);
    setIsCameraEnabled(false);
    setIsScreenShareEnabled(false);
    setCallSlot(null);
    resetMemberAudio();
  }, []);

  const setVoiceMode = useCallback(
    (mode: VoiceMode) => {
      const updated = { ...voiceSettings, mode };
      localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(updated));
      setVoiceSettings(updated);
      setIsMuted(false);
    },
    [voiceSettings],
  );

  const setPttKey = useCallback(
    (key: string) => {
      const updated = { ...voiceSettings, pttKey: key };
      localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(updated));
      setVoiceSettings(updated);
    },
    [voiceSettings],
  );

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    if (!next && isDeafened) setIsDeafened(false);
  }, [isMuted, isDeafened]);

  const toggleDeafen = useCallback(() => {
    const next = !isDeafened;
    setIsDeafened(next);
    if (next) setIsMuted(true);
  }, [isDeafened]);

  const value = useMemo(
    () => ({
      activeCall,
      join,
      leave,
      voiceMode: voiceSettings.mode,
      pttKey: voiceSettings.pttKey,
      setVoiceMode,
      setPttKey,
      isPttActive,
      setIsPttActive,
      isMuted,
      isDeafened,
      toggleMute,
      toggleDeafen,
      micLevelRef,
      callSlot,
      setCallSlot,
      isCameraEnabled,
      isScreenShareEnabled,
      setCameraEnabled,
      setScreenShareEnabled,
      registerMediaControls,
      setMediaEnabledState,
    }),
    [
      activeCall,
      join,
      leave,
      voiceSettings.mode,
      voiceSettings.pttKey,
      setVoiceMode,
      setPttKey,
      isPttActive,
      isMuted,
      isDeafened,
      toggleMute,
      toggleDeafen,
      callSlot,
      isCameraEnabled,
      isScreenShareEnabled,
      setCameraEnabled,
      setScreenShareEnabled,
      registerMediaControls,
      setMediaEnabledState,
    ],
  );

  return <AudioCallContext.Provider value={value}>{children}</AudioCallContext.Provider>;
}

export function useAudioCall() {
  const ctx = useContext(AudioCallContext);
  if (!ctx) throw new Error("useAudioCall must be used within AudioCallProvider");
  return ctx;
}
