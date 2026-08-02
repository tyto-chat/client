import { useMemo, useState } from "react";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { usePatchAdminServerConfig } from "@/queries/adminServerConfigQueries";
import { useNotification } from "@/context/NotificationContext";
import { useTranslation } from "react-i18next";
import type { AdminServerConfig, AdminServerConfigPatch } from "@/api/adminServerConfig";

export function usePanelForm<K extends keyof AdminServerConfigPatch & keyof AdminServerConfig>(
  config: AdminServerConfig,
  keys: readonly K[],
) {
  const { t } = useTranslation("admin");
  const { notify } = useNotification();
  const patch = usePatchAdminServerConfig();

  const initial = useMemo(() => {
    const slice = {} as Pick<AdminServerConfig, K>;
    for (const k of keys) slice[k] = config[k];
    return slice;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, ...keys.map((k) => config[k])]);

  const [form, setForm] = useState<Pick<AdminServerConfig, K> | null>(null);
  const current = form ?? initial;
  const dirty = JSON.stringify(current) !== JSON.stringify(initial);

  useUnsavedGuard(dirty);

  function set<F extends K>(key: F, value: AdminServerConfig[F]) {
    setForm((prev) => ({ ...(prev ?? initial), [key]: value }));
  }

  async function save() {
    if (!dirty) return;
    const body: AdminServerConfigPatch = {};
    for (const k of keys) {
      if (current[k] !== initial[k]) (body[k] as AdminServerConfig[K]) = current[k];
    }
    if (Object.keys(body).length === 0) return;
    try {
      await patch.mutateAsync(body);
      setForm(null);
      notify(t("save_success"), "success");
    } catch {
      notify(t("save_failed"), "error");
    }
  }

  return { current, dirty, set, save, saving: patch.isPending };
}
