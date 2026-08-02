/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface MessagePopoverValue {
  openOwner: string | null;
  setOpenOwner: (owner: string | null) => void;
  releaseOwner: (owner: string) => void;
  hoverOwner: string | null;
  setHoverOwner: (owner: string) => void;
  releaseHover: (owner: string) => void;
  touchOwner: string | null;
  setTouchOwner: (owner: string | null) => void;
}

const MessagePopoverContext = createContext<MessagePopoverValue>({
  openOwner: null,
  setOpenOwner: () => {},
  releaseOwner: () => {},
  hoverOwner: null,
  setHoverOwner: () => {},
  releaseHover: () => {},
  touchOwner: null,
  setTouchOwner: () => {},
});

export function MessagePopoverProvider({ children }: { children: React.ReactNode }) {
  const [openOwner, setOpenOwner] = useState<string | null>(null);
  const [hoverOwner, setHoverOwnerState] = useState<string | null>(null);
  const [touchOwner, setTouchOwner] = useState<string | null>(null);

  const releaseOwner = useCallback(
    (owner: string) => setOpenOwner((current) => (current === owner ? null : current)),
    [],
  );

  // Last row entered wins, so a mouseleave the browser never fired — a popover
  // unmounting under the pointer eats one — cannot leave a second bar on screen.
  const setHoverOwner = useCallback((owner: string) => setHoverOwnerState(owner), []);
  const releaseHover = useCallback(
    (owner: string) => setHoverOwnerState((current) => (current === owner ? null : current)),
    [],
  );

  const value = useMemo(
    () => ({
      openOwner,
      setOpenOwner,
      releaseOwner,
      hoverOwner,
      setHoverOwner,
      releaseHover,
      touchOwner,
      setTouchOwner,
    }),
    [openOwner, releaseOwner, hoverOwner, setHoverOwner, releaseHover, touchOwner],
  );

  return <MessagePopoverContext.Provider value={value}>{children}</MessagePopoverContext.Provider>;
}

export function useMessagePopover() {
  return useContext(MessagePopoverContext);
}
