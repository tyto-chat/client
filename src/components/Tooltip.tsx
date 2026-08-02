import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: Props) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, below: false });
  const triggerRef = useRef<HTMLSpanElement>(null);

  function show() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 40;
    setCoords({
      top: below ? r.bottom + 6 : r.top - 6,
      left: r.left + r.width / 2,
      below,
    });
    setVisible(true);
  }

  useEffect(() => {
    if (!visible) return;
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 40;
      setCoords({ top: below ? r.bottom + 6 : r.top - 6, left: r.left + r.width / 2, below });
    }
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [visible]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        className={className}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] max-w-xs break-all rounded-md bg-canvas px-2.5 py-1.5 text-xs text-white shadow-soft-md"
            style={{
              top: coords.below ? coords.top : undefined,
              bottom: coords.below ? undefined : `calc(100vh - ${coords.top}px)`,
              left: coords.left,
              transform: "translateX(-50%)",
            }}
          >
            {content}
            <span
              className="absolute left-1/2 -translate-x-1/2 border-4 border-transparent"
              style={
                coords.below
                  ? { bottom: "100%", borderBottomColor: "inherit" }
                  : { top: "100%", borderTopColor: "inherit" }
              }
            />
          </div>,
          document.body,
        )}
    </>
  );
}
