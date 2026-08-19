import { useTranslation } from "react-i18next";
import { ShieldIcon, StarFilledIcon } from "@/components/icons";

export function RoleBadge({ kind }: { kind: "admin" | "mod" }) {
  const { t } = useTranslation("community");
  const admin = kind === "admin";
  const label = admin ? t("admin_badge") : t("role_mod_label");
  const title = admin ? t("role_admin_title") : t("channel_moderator_badge");
  const desc = admin ? t("role_admin_desc") : t("role_mod_desc");
  const scope = admin ? t("role_admin_scope") : t("role_mod_scope");

  return (
    <span
      className={`group/role relative inline-flex h-[18px] cursor-default items-center gap-0.5 rounded-full px-1.5 text-[0.625rem] font-bold uppercase leading-none tracking-wide ring-1 ring-inset ${
        admin
          ? "bg-amber-500/15 text-amber-600 ring-amber-500/40 dark:text-amber-400"
          : "bg-accent-subtle text-accent-text ring-accent/35"
      }`}
    >
      {admin ? <StarFilledIcon size={11} /> : <ShieldIcon size={11} />}
      <span className="block cap-trim">{label}</span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 hidden w-52 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line-strong bg-overlay p-2.5 text-left shadow-soft-md transition-all transition-discrete duration-150 group-hover/role:block starting:translate-y-1 starting:opacity-0"
      >
        <span className="flex items-center gap-1.5 text-[0.8125rem] font-bold normal-case tracking-normal text-fg">
          <span className={`h-2 w-2 rounded-full ${admin ? "bg-amber-500" : "bg-accent"}`} />
          {title}
        </span>
        <span className="mt-1 block text-xs font-medium normal-case leading-snug tracking-normal text-fg-muted">
          {desc}
        </span>
        <span className="mt-1.5 block border-t border-line pt-1.5 text-[0.6875rem] font-medium normal-case tracking-normal text-fg-subtle">
          {scope}
        </span>
      </span>
    </span>
  );
}
