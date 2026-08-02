import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMobileNav } from "@/context/MobileNavContext";
import { MenuIcon } from "@/components/icons";

interface Props {
  title: ReactNode;
  right?: ReactNode;
}

export function MobileTopBar({ title, right }: Props) {
  const { t } = useTranslation("common");
  const { toggleNav } = useMobileNav();

  return (
    <div className="flex items-center gap-2 border-b border-line px-2 py-2 md:hidden">
      <button
        type="button"
        data-testid="mobile-nav-toggle"
        onClick={toggleNav}
        aria-label={t("open_navigation", "Open navigation")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface hover:text-fg"
      >
        <MenuIcon size={22} />
      </button>
      <h1 className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-base font-semibold">
        {title}
      </h1>
      {right ? <div className="flex shrink-0 items-center gap-1">{right}</div> : null}
    </div>
  );
}
