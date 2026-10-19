import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteContentLevel } from "@/api/userPreferences";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateUserPreference } from "@/queries/userPreferencesQueries";
import {
  REMOTE_CONTENT_LEVELS,
  getRemoteContentHosts,
  getRemoteContentLevel,
  normalizeHost,
  setRemoteContentHosts,
  setRemoteContentLevel,
} from "@/utils/remoteContent";
import { SettingRow } from "@/components/preferences/SettingRow";
import {
  segActive,
  segBase,
  segInactive,
  sectionHeading,
} from "@/components/preferences/panelStyles";
import { XIcon } from "@/components/icons";

export function RemoteContentSection() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const updatePreference = useUpdateUserPreference();
  const [level, setLevel] = useState<RemoteContentLevel>(getRemoteContentLevel);
  const [hosts, setHosts] = useState<string[]>(getRemoteContentHosts);
  const [draft, setDraft] = useState("");

  const chooseLevel = (next: RemoteContentLevel) => {
    setLevel(next);
    setRemoteContentLevel(next);
    if (user) updatePreference.mutate({ remoteContent: next });
  };

  const saveHosts = (next: string[]) => {
    setHosts(next);
    setRemoteContentHosts(next);
    if (user) updatePreference.mutate({ remoteContentHosts: next });
  };

  const addHost = () => {
    const host = normalizeHost(draft);
    if (!host) return;
    setDraft("");
    if (hosts.includes(host)) return;
    saveHosts([...hosts, host]);
  };

  return (
    <section>
      <h3 className={sectionHeading}>{t("remote_content_title")}</h3>
      <div className="flex flex-col gap-2">
        <SettingRow label={t("remote_content_label")} hint={t("remote_content_hint")}>
          {REMOTE_CONTENT_LEVELS.map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`remote-content-${value}`}
              onClick={() => chooseLevel(value)}
              className={`${segBase} ${level === value ? segActive : segInactive}`}
            >
              <span className="block cap-trim">{t(`remote_content_${value}`)}</span>
            </button>
          ))}
        </SettingRow>
        {level !== "all" && (
          <SettingRow
            label={t("remote_content_hosts")}
            hint={t("remote_content_hosts_hint")}
            footer={
              hosts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {hosts.map((host) => (
                    <span
                      key={host}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-raised py-1 pl-2.5 pr-1.5 text-xs text-fg"
                    >
                      <span className="cap-trim">{host}</span>
                      <button
                        type="button"
                        aria-label={t("remote_content_remove_host", { host })}
                        onClick={() => saveHosts(hosts.filter((entry) => entry !== host))}
                        className="rounded-full p-0.5 text-fg-subtle transition-colors hover:bg-surface hover:text-fg"
                      >
                        <XIcon size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )
            }
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                addHost();
              }}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label={t("remote_content_add_host")}
                placeholder={t("remote_content_add_host")}
                className="w-36 rounded-lg border border-line-strong bg-raised px-2 py-1 text-xs text-fg"
              />
              <button
                type="submit"
                className="rounded-lg border border-line-strong bg-raised px-2 py-1 text-xs text-fg hover:bg-surface"
              >
                {t("remote_content_add")}
              </button>
            </form>
          </SettingRow>
        )}
      </div>
    </section>
  );
}
