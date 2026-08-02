import { useEffect, useRef, useState } from "react";
import { NotificationPanel } from "@/components/NotificationPanel";

interface Props {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  communityIdentifier: string;
  onClose: () => void;
}

export function NotificationPopover({ anchorRef, communityIdentifier, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const panelWidth = Math.min(320, window.innerWidth - 16);
    const rawLeft = r.left - panelWidth + r.width;
    setStyle({
      position: "fixed",
      top: r.bottom + 8,
      left: Math.max(8, rawLeft),
      width: panelWidth,
    });
  }, [anchorRef]);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      // Modals opened from inside the panel (e.g. the appeal form) portal to
      // body, so they count as "outside" — closing here would unmount the panel
      // and the modal with it before the click could do anything.
      if (target?.closest('[role="dialog"]')) return;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [anchorRef, onClose]);

  return (
    <div ref={panelRef} style={style} className="z-50">
      <NotificationPanel communityIdentifier={communityIdentifier} />
    </div>
  );
}
