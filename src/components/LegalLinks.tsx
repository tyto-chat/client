import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LegalDocumentModal } from "@/components/LegalDocumentModal";
import type { LegalDocumentType, ServerInfo } from "@/types/api";

const linkClass = "text-[var(--accent)] hover:underline dark:text-[var(--accent-muted)]";

function useLegalDocs(
  serverInfo: ServerInfo | null,
  context: "standalone" | "consent" = "standalone",
) {
  const { t } = useTranslation("auth");
  const [openDoc, setOpenDoc] = useState<LegalDocumentType | null>(null);

  // Split keys: inflected languages (pl, uk) need a different grammatical case
  // inside the consent sentence than for a standalone link.
  const consent = context === "consent";
  const links: { key: LegalDocumentType; label: string }[] = [];
  if (serverInfo?.hasTerms) {
    links.push({
      key: "terms",
      label: t(consent ? "terms_of_service_consent" : "terms_of_service"),
    });
  }
  if (serverInfo?.hasPrivacy) {
    links.push({ key: "privacy", label: t(consent ? "privacy_policy_consent" : "privacy_policy") });
  }

  const modal =
    openDoc !== null ? (
      <LegalDocumentModal type={openDoc} onClose={() => setOpenDoc(null)} />
    ) : null;

  return { links, openDoc, setOpenDoc, modal };
}

export function LegalConsentLabel({ serverInfo }: { serverInfo: ServerInfo | null }) {
  const { t } = useTranslation("auth");
  const { links, setOpenDoc, modal } = useLegalDocs(serverInfo, "consent");

  return (
    <>
      {t("consent_prefix")}{" "}
      {links.map((link, i) => (
        <span key={link.key}>
          {i > 0 && <> {t("consent_and")} </>}
          <button type="button" className={linkClass} onClick={() => setOpenDoc(link.key)}>
            {link.label}
          </button>
        </span>
      ))}
      .{modal}
    </>
  );
}

export function PoweredByTyto() {
  const { t } = useTranslation("auth");

  return (
    <p className="text-center text-[11px] text-fg-subtle">
      {t("powered_by")}{" "}
      <a
        href="https://tyto.chat"
        target="_blank"
        rel="noreferrer"
        className="text-accent-gradient font-medium transition-opacity hover:opacity-80"
      >
        Tyto
      </a>
    </p>
  );
}

export function LegalFooterLinks({ serverInfo }: { serverInfo: ServerInfo | null }) {
  const { t } = useTranslation("auth");
  const { links, setOpenDoc, modal } = useLegalDocs(serverInfo);

  const items: React.ReactNode[] = links.map((link) => (
    <button key={link.key} type="button" className={linkClass} onClick={() => setOpenDoc(link.key)}>
      {link.label}
    </button>
  ));
  if (serverInfo?.legalContactEmail) {
    items.push(
      <a key="contact" href={`mailto:${serverInfo.legalContactEmail}`} className={linkClass}>
        {t("legal_contact")}
      </a>,
    );
  }
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
      {items.map((item, i) => (
        <span key={i}>{item}</span>
      ))}
      {modal}
    </div>
  );
}
