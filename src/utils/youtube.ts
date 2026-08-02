const YT_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch[^#\s]*[?&]v=([\w-]{11})/g,
  /(?:https?:\/\/)?youtu\.be\/([\w-]{11})/g,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([\w-]{11})/g,
];

export function extractYouTubeIds(html: string): string[] {
  // raw pre-sanitize input: DOMParser is inert here, a live innerHTML would execute payloads
  const text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const pattern of YT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const id = match[1];
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }

  return ids;
}
