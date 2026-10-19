const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;

export function extractImageUrls(text: string): string[] {
  text = text.replace(MARKDOWN_IMAGE, " ");
  const regex =
    /https?:\/\/[^\s<>"{}|\\^`[\]]*\.(?:jpg|jpeg|png|gif|webp|bmp|svg)(?:[?#][^\s<>"{}|\\^`[\]]*)?/gi;

  const urls: string[] = [];
  const seen = new Set<string>();

  let match;
  while ((match = regex.exec(text)) !== null) {
    const url = match[0];
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}
