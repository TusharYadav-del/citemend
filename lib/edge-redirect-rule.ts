export function routingPair(citedUrl: string, destinationUrl: string, domain: string) {
  if (!/^[a-z0-9.-]{1,253}$/.test(domain)) return null;
  try {
    const source = new URL(citedUrl);
    const destination = new URL(destinationUrl);
    const host = new URL(`https://${domain}`).hostname;
    if (host !== domain || !["http:", "https:"].includes(source.protocol) || source.hostname !== host || source.port || source.username || source.password) return null;
    if (destination.protocol !== "https:" || destination.hostname !== host || destination.port || destination.username || destination.password || destination.hash || destination.pathname === source.pathname) return null;
    return { source_host: host, source_path: source.pathname, destination: destination.href };
  } catch { return null; }
}
