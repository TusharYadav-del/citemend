export type ExportableRedirect = {
  cited_url: string;
  http_status: number;
  suggested_redirect: string | null;
};

export type RedirectExportFormat = "htaccess" | "vercel" | "shopify";

function safeUrl(value: string, domain: string): URL | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) return null;
    return url;
  } catch {
    return null;
  }
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildRedirectExport(
  domain: string,
  links: ExportableRedirect[],
  format: RedirectExportFormat,
): string {
  const redirects = links.flatMap((link) => {
    if (link.http_status !== 404 || !link.suggested_redirect) return [];
    const source = safeUrl(link.cited_url, domain);
    const destination = safeUrl(link.suggested_redirect, domain);
    return source && destination ? [{ source, destination }] : [];
  });

  if (format === "vercel") {
    return JSON.stringify({
      redirects: redirects.map(({ source, destination }) => ({
        source: source.pathname + source.search,
        destination: destination.href,
        permanent: true,
      })),
    }, null, 2);
  }

  if (format === "shopify") {
    return [
      '"Redirect from","Redirect to"',
      ...redirects.map(({ source, destination }) => [
        csvCell(source.pathname + source.search),
        csvCell(destination.pathname + destination.search),
      ].join(",")),
    ].join("\n");
  }

  return [
    `# 301 redirects for ${domain}`,
    ...redirects.map(({ source, destination }) =>
      `Redirect 301 "${source.pathname}" "${destination.href}"`,
    ),
  ].join("\n");
}
