import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { ChevronDownIcon } from "@/components/icons";
import { visibleTabCount } from "@/components/ui/visibleTabCount";

export interface ModalTabItem {
  key: string;
  label: ReactNode;
}

interface Props {
  tabs: ModalTabItem[];
  active: string;
  onChange: (key: string) => void;
  testIdPrefix?: string;
  leading?: ReactNode;
}

const GAP = 6;

// py is doubled to offset cap-trim, which shrinks the box to cap height.
const pillClass = (on: boolean): string =>
  `whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cap-trim ${
    on
      ? "bg-accent-gradient text-on-accent shadow-soft-sm"
      : "bg-surface text-fg-muted hover:bg-raised hover:text-fg"
  }`;

export function ModalTabs({ tabs, active, onChange, testIdPrefix, leading }: Props) {
  const { t } = useTranslation("common");
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const leadingRef = useRef<HTMLDivElement>(null);
  const [maxVisible, setMaxVisible] = useState(tabs.length);
  const hasLeading = Boolean(leading);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const lead = leadingRef.current;

    const recompute = () => {
      const cw = wrap.clientWidth;
      if (cw === 0) {
        setMaxVisible(tabs.length);
        return;
      }
      const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth);
      const taken = lead ? lead.offsetWidth + GAP : 0;
      setMaxVisible(visibleTabCount(cw - taken, widths, lead ? 0 : 1));
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    if (lead) ro.observe(lead);
    return () => ro.disconnect();
  }, [tabs, hasLeading]);

  const showTabs = tabs.length > 1;
  if (!showTabs && !leading) return null;

  const visible = tabs.slice(0, maxVisible);
  const overflow = tabs.slice(maxVisible);
  const activeHidden = overflow.some((tab) => tab.key === active);

  return (
    <div ref={wrapRef} className="relative border-b border-line pb-3">
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex gap-1.5"
      >
        {tabs.map((tab) => (
          <span key={tab.key} className={pillClass(false)}>
            {tab.label}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {leading && (
          <div ref={leadingRef} className="flex shrink-0 items-center gap-1.5">
            {leading}
            {showTabs && <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />}
          </div>
        )}
        {showTabs &&
          visible.map((tab) => (
            <button
              key={tab.key}
              data-testid={testIdPrefix ? `${testIdPrefix}${tab.key}` : undefined}
              onClick={() => onChange(tab.key)}
              aria-current={active === tab.key ? "true" : undefined}
              className={pillClass(active === tab.key)}
            >
              {tab.label}
            </button>
          ))}

        {overflow.length > 0 && (
          <Menu
            align="right"
            label={t("more")}
            trigger={
              <span className={`inline-flex items-center gap-1 ${pillClass(activeHidden)}`}>
                {t("more")}
                <ChevronDownIcon size={14} />
              </span>
            }
          >
            {overflow.map((tab) => (
              <MenuItem
                key={tab.key}
                testId={testIdPrefix ? `${testIdPrefix}${tab.key}` : undefined}
                onSelect={() => onChange(tab.key)}
              >
                {tab.label}
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>
    </div>
  );
}
