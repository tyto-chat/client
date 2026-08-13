import {
  useRef,
  useState,
  useCallback,
  useEffect,
  Children,
  isValidElement,
  cloneElement,
} from "react";
import { createPortal } from "react-dom";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { useClickOutside } from "@/hooks/useClickOutside";

interface MenuProps {
  trigger: ReactNode;
  label: string;
  children: ReactNode;
  align?: "left" | "right";
  testId?: string;
}

export function Menu({ trigger, label, children, align = "left", testId }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside([ref, menuRef], close, open);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(
      align === "right"
        ? { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }
        : { top: r.bottom + 4, left: Math.max(8, r.left) },
    );
  }, [align]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  useEffect(() => {
    if (!open || !pos) return;
    const el = menuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.left < 8 && pos.left !== 8) {
      setPos({ top: pos.top, left: 8 });
    } else if (r.right > window.innerWidth - 8 && pos.right !== 8) {
      setPos({ top: pos.top, right: 8 });
    } else if (r.bottom > window.innerHeight - 8) {
      const top = Math.max(8, window.innerHeight - 8 - r.height);
      if (Math.abs(pos.top - top) > 1) setPos({ ...pos, top });
    }
  }, [open, pos]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "ArrowDown"
          ? items[(idx + 1) % items.length]
          : items[(idx - 1 + items.length) % items.length];
      next?.focus();
    }
  }

  return (
    <div ref={ref} className="relative inline-block" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          measure();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right }}
            className="z-50 min-w-44 rounded-lg border border-line bg-overlay py-1 shadow-soft-md"
          >
            {Children.map(children, (child) =>
              isValidElement(child)
                ? cloneElement(child as ReactElement<{ onClose?: () => void }>, { onClose: close })
                : child,
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

interface MenuItemProps {
  children: ReactNode;
  onSelect: () => void;
  onClose?: () => void;
  iconLeft?: ReactNode;
  danger?: boolean;
  testId?: string;
}

export function MenuItem({ children, onSelect, onClose, iconLeft, danger, testId }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      tabIndex={-1}
      onClick={() => {
        onSelect();
        onClose?.();
      }}
      className={cn(
        "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm font-normal",
        "hover:bg-surface focus-visible:bg-surface focus-visible:outline-none",
        danger ? "text-danger" : "text-fg",
      )}
    >
      {iconLeft}
      {children}
    </button>
  );
}

export function MenuDivider() {
  return <div role="separator" className="my-1 border-t border-line" />;
}

interface MenuStaticItemProps {
  children: ReactNode;
  className?: string;
  testId?: string;
}

export function MenuStaticItem({ children, className, testId }: MenuStaticItemProps) {
  return (
    <div
      role="presentation"
      data-testid={testId}
      className={cn("truncate px-3 py-2 text-xs text-fg-subtle", className)}
    >
      {children}
    </div>
  );
}
