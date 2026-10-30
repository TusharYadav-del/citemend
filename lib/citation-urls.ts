/** Normalize structured citation URLs without altering legitimate path/query punctuation. */
export function normalizeCitationUrl(value: string): string | null {
  try {
    if (value.length > 2048) return null;
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

/** Extract prose/Markdown URLs while preserving balanced parentheses in URL paths. */
export function extractTextUrls(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    let candidate = match[0];
    while (candidate) {
      if (/[.,;:!?]$/.test(candidate)) { candidate = candidate.slice(0, -1); continue; }
      const last = candidate.at(-1)!;
      const opening = last === ")" ? "(" : last === "]" ? "[" : last === "}" ? "{" : null;
      if (opening && [...candidate].filter((char) => char === last).length > [...candidate].filter((char) => char === opening).length) { candidate = candidate.slice(0, -1); continue; }
      break;
    }
    const url = normalizeCitationUrl(candidate.replaceAll("&amp;", "&"));
    if (url) found.add(url);
  }
  return [...found];
}
