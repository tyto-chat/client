import { createRoot } from "react-dom/client";
import "./embed.css";
import { EmbedCard } from "./EmbedCard";
import { bootstrapEmbedApiBase } from "./api";

function parseUuid(): string {
  return /\/embed\/m\/([^/?#]+)/.exec(location.pathname)?.[1] ?? "";
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
})();
