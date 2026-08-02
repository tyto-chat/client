import { createContext, useContext, useState } from "react";

type AuthModal = "login" | "register" | null;

interface AuthModalContextValue {
  openLogin: () => void;
  openRegister: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue>({
  openLogin: () => {},
  openRegister: () => {},
});

export function useAuthModal() {
  return useContext(AuthModalContext);
}

interface AuthModalProviderProps {
  children: (state: {
    modal: AuthModal;
    close: () => void;
    switchToRegister: () => void;
    switchToLogin: () => void;
  }) => React.ReactNode;
}

export function AuthModalProvider({ children }: AuthModalProviderProps) {
  const [modal, setModal] = useState<AuthModal>(null);

  return (
    <AuthModalContext.Provider
      value={{
        openLogin: () => setModal("login"),
        openRegister: () => setModal("register"),
      }}
    >
      {children({
        modal,
        close: () => setModal(null),
        switchToRegister: () => setModal("register"),
        switchToLogin: () => setModal("login"),
      })}
    </AuthModalContext.Provider>
  );
}
