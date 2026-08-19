export type AppMode = "web" | "desktop" | "mobile";

export function getAppMode(): AppMode {
  const raw = import.meta.env.VITE_APP_MODE as string | undefined;
  return raw === "desktop" || raw === "mobile" ? raw : "web";
}

export function isManagedIdentityMode(): boolean {
  return getAppMode() !== "web";
}

export function railWidthClass(): string {
  return isManagedIdentityMode() ? "w-[72px]" : "w-16";
}
