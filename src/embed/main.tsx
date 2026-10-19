import { createRoot } from "react-dom/client";
import "./embed.css";
import { EmbedCard } from "./EmbedCard";
import { bootstrapEmbedApiBase } from "./api";

function parseUuid(): string {
  return (
    /\/embed\/m\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?#]|$)/i.exec(
      location.pathname,
    )?.[1] ?? ""
  );
}

function applyTheme(): void {
  const theme = new URLSearchParams(location.search).get("theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

(async () => {
  applyTheme();
  const uuid = parseUuid();

  await bootstrapEmbedApiBase();

  createRoot(document.getElementById("root")!).render(<EmbedCard uuid={uuid} />);
})().catch((error: unknown) => console.error(error));
