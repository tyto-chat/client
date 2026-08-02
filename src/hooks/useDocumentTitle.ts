import { useEffect } from "react";
import { getServerInfo } from "@/api/serverInfo";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const appName = getServerInfo()?.name ?? "Tyto";
    document.title = title ? `${title} · ${appName}` : appName;
    return () => {
      document.title = appName;
    };
  }, [title]);
}
