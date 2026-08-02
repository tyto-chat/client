import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSubmitKey, type SubmitKey } from "@/context/SubmitKeyContext";
import {
  getSkinTone,
  setSkinTone as persistSkinTone,
  skinToneGlyph,
  SKIN_TONE_COUNT,
} from "@/utils/emojiSkinTone";
import { getSendTypingIndicator, setSendTypingIndicator } from "@/utils/typingPreference";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateUserPreference, useUserPreferences } from "@/queries/userPreferencesQueries";
import { Switch } from "@/components/ui/Switch";
import { SettingRow } from "@/components/preferences/SettingRow";
import {
  segBase,
  segActive,
  segInactive,
  sectionHeading,
} from "@/components/preferences/panelStyles";

const SUBMIT_KEY_VALUES: SubmitKey[] = ["enter", "shift+enter", "ctrl+enter", "none"];

export function ChatPanel() {
  const { t } = useTranslation("settings");
  const { submitKey, setSubmitKey } = useSubmitKey();
  const [skinTone, setSkinToneState] = useState(getSkinTone);
  const [sendTyping, setSendTyping] = useState(getSendTypingIndicator);
  const [convertEmoticons, setConvertEmoticons] = useState(
    () => localStorage.getItem(STORAGE_KEYS.CONVERT_EMOTICONS) !== "false",
  );

  const { user } = useAuth();
  const updatePreference = useUpdateUserPreference();

  const toggleSendTyping = () => {
    const next = !sendTyping;
    setSendTyping(next);
    setSendTypingIndicator(next);
    if (user) updatePreference.mutate({ sendTypingIndicator: next });
  };

  const toggleConvertEmoticons = () => {
    const next = !convertEmoticons;
    setConvertEmoticons(next);
    localStorage.setItem(STORAGE_KEYS.CONVERT_EMOTICONS, next ? "true" : "false");
    if (user) updatePreference.mutate({ convertEmoticons: next });
  };

  const { data: serverPrefs } = useUserPreferences();
  const resumeEnabled = serverPrefs?.resumeLastLocation !== false;
  const toggleResumeLastLocation = () => {
    if (user) updatePreference.mutate({ resumeLastLocation: !resumeEnabled });
  };

  const submitKeyLabels: Record<SubmitKey, string> = {
    enter: "Enter",
    "shift+enter": "Shift+Enter",
    "ctrl+enter": "Ctrl+Enter",
    none: t("submit_key_none"),
  };

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className={sectionHeading}>{t("composing")}</h3>
        <div className="flex flex-col gap-2">
          <SettingRow label={t("send_message")}>
            {SUBMIT_KEY_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSubmitKey(value)}
                className={`${segBase} ${submitKey === value ? segActive : segInactive}`}
              >
                <span className="block cap-trim">{submitKeyLabels[value]}</span>
              </button>
            ))}
          </SettingRow>
          <SettingRow label={t("convert_emoticons")} hint={t("convert_emoticons_hint")}>
            <Switch
              checked={convertEmoticons}
              onChange={toggleConvertEmoticons}
              label={t("convert_emoticons")}
            />
          </SettingRow>
          <SettingRow label={t("skin_tone")} hint={t("skin_tone_hint")}>
            {Array.from({ length: SKIN_TONE_COUNT }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  persistSkinTone(i);
                  setSkinToneState(i);
                }}
                aria-label={`${t("skin_tone")} ${i + 1}`}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg leading-none transition-colors ${
                  i === skinTone ? segActive : segInactive
                }`}
              >
                {skinToneGlyph(i)}
              </button>
            ))}
          </SettingRow>
        </div>
      </section>

      <section>
        <h3 className={sectionHeading}>{t("chat_privacy_continuity")}</h3>
        <div className="flex flex-col gap-2">
          <SettingRow label={t("send_typing_indicator")} hint={t("send_typing_indicator_hint")}>
            <Switch
              checked={sendTyping}
              onChange={toggleSendTyping}
              label={t("send_typing_indicator")}
            />
          </SettingRow>
          {user && (
            <SettingRow label={t("resume_last_location")} hint={t("resume_last_location_hint")}>
              <Switch
                checked={resumeEnabled}
                onChange={toggleResumeLastLocation}
                testId="pref-resume-last-location"
                label={t("resume_last_location")}
              />
            </SettingRow>
          )}
        </div>
      </section>
    </div>
  );
}
