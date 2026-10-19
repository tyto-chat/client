import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { isManagedIdentityMode } from "@/platform/appMode";
import { getPlatformBridge } from "@/platform/bridge";
import type { BridgeSpellCheck, PlatformBridge } from "@/platform/PlatformBridge";
import { SettingRow } from "@/components/preferences/SettingRow";
import { sectionHeading } from "@/components/preferences/panelStyles";
import { XIcon } from "@/components/icons";

type SpellCheckBridge = NonNullable<PlatformBridge["spellCheck"]>;

function resolveSpellCheck(): SpellCheckBridge | null {
  if (!isManagedIdentityMode()) return null;
  try {
    return getPlatformBridge().spellCheck ?? null;
  } catch {
    return null;
  }
}

export function SpellCheckSection() {
  const { t, i18n } = useTranslation("settings");
  const [bridge] = useState(resolveSpellCheck);
  const [state, setState] = useState<BridgeSpellCheck | null>(null);

  useEffect(() => {
    if (!bridge) return undefined;
    let live = true;
    void bridge.get().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [bridge]);

  const displayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([i18n.language], { type: "language" });
    } catch {
      return null;
    }
  }, [i18n.language]);

  if (!bridge || !state || state.available.length === 0) return null;

  const nameOf = (code: string) => {
    try {
      return displayNames?.of(code) ?? code;
    } catch {
      return code;
    }
  };
  const apply = (languages: string[]) => void bridge.set(languages).then(setState);
  const addable = state.available
    .filter((code) => !state.enabled.includes(code))
    .map((code) => ({ code, name: nameOf(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, i18n.language));

  return (
    <section>
      <h3 className={sectionHeading}>{t("spellcheck_title")}</h3>
      <div className="space-y-2">
        <SettingRow label={t("spellcheck_languages")} hint={t("spellcheck_hint")}>
          <div className="flex max-w-xs flex-wrap items-center justify-end gap-1.5">
            {state.enabled.length === 0 && (
              <span className="text-xs text-fg-muted">{t("spellcheck_off")}</span>
            )}
            {state.enabled.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-raised py-1 pl-2.5 pr-1.5 text-xs text-fg"
              >
                <span className="cap-trim">{nameOf(code)}</span>
                <button
                  type="button"
                  aria-label={t("spellcheck_remove", { language: nameOf(code) })}
                  onClick={() => apply(state.enabled.filter((entry) => entry !== code))}
                  className="rounded-full p-0.5 text-fg-subtle transition-colors hover:bg-surface hover:text-fg"
                >
                  <XIcon size={12} />
                </button>
              </span>
            ))}
            {addable.length > 0 && (
              <select
                aria-label={t("spellcheck_add")}
                value=""
                onChange={(event) => {
                  if (event.target.value) apply([...state.enabled, event.target.value]);
                }}
                className="rounded-lg border border-line-strong bg-raised px-2 py-1 text-xs text-fg"
              >
                <option value="">{t("spellcheck_add")}</option>
                {addable.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </SettingRow>
      </div>
    </section>
  );
}
