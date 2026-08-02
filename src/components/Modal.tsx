import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";
import { XIcon } from "@/components/icons";

interface ModalProps {
  title?: React.ReactNode;
  ariaLabel?: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  dismissable?: boolean;
  children: (close: () => void) => React.ReactNode;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  ariaLabel,
  onClose,
  size = "md",
  dismissable = true,
  children,
}: ModalProps) {
  const { t } = useTranslation("common");
  const [isClosing, setIsClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const priorFocusRef = useRef<Element | null>(null);

  function handleClose() {
    setIsClosing(true);
    setTimeout(onClose, 170);
  }

  useEffect(() => {
    priorFocusRef.current = document.activeElement;

    const el = dialogRef.current;
    if (el) {
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus();
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
      const prior = priorFocusRef.current;
      if (prior && "focus" in prior) {
        (prior as HTMLElement).focus();
      }
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissable) {
        e.stopPropagation();
        handleClose();
        return;
      }

      if (e.key === "Tab") {
        const el = dialogRef.current;
        if (!el) return;
        const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (n) => !n.closest("[inert]"),
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissable]);

  const titleId = title ? "modal-title" : undefined;

  // Portalled: a transformed ancestor would become the containing block for `fixed`.
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-black/60",
        isClosing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onMouseDown={dismissable ? handleClose : undefined}
    >
      <div className="flex min-h-full items-center justify-center p-4 max-md:p-3">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-label={titleId ? undefined : ariaLabel}
          tabIndex={-1}
          className={cn(
            "relative my-auto w-full rounded-2xl bg-overlay p-6 text-fg shadow-soft-lg ring-1 ring-inset ring-line",
            size === "sm"
              ? "max-w-[min(90vw,24rem)]"
              : size === "2xl"
                ? "max-w-[min(90vw,56rem)]"
                : size === "xl"
                  ? "max-w-[min(90vw,42rem)]"
                  : size === "lg"
                    ? "max-w-[min(90vw,32rem)]"
                    : "max-w-[min(90vw,28rem)]",
            isClosing ? "animate-modal-out" : "animate-modal-in",
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {dismissable && (
            <button
              onClick={handleClose}
              aria-label={t("close")}
              title={t("close")}
              className="absolute right-4 top-4 flex items-center justify-center text-fg-subtle hover:text-fg [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
            >
              <XIcon size={16} />
            </button>
          )}
          {title && (
            <div className="mb-4 pr-6">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
            </div>
          )}
          {children(handleClose)}
        </div>
      </div>
    </div>,
    document.body,
  );
}
