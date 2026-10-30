import "server-only";
import dns from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}

export function assertPublicUrl(value: string | URL): URL {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) throw new Error("Expected a public HTTP(S) URL using a standard port.");
  if (host === "localhost" || /\.(localhost|local|internal)$/.test(host) || isIP(host) && !isPublicAddress(host)) throw new Error("Private and loopback destinations are not allowed.");
  return url;
}

/** Reject every non-public answer; the validated address is the connection target. */
export async function resolvePublicHost(hostname: string) {
  const answers = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!answers.length || answers.some((answer) => !isPublicAddress(answer.address))) throw new Error("DNS resolved to a non-public destination.");
  return answers;
}
const publicLookup: LookupFunction = (hostname, options, callback) => {
  resolvePublicHost(hostname).then((answers) => {
    const candidates = options.family ? answers.filter((answer) => answer.family === options.family) : answers;
    if (!candidates.length) { callback(new Error("No public address for the requested family."), ""); return; }
    if (options.all) callback(null, candidates);
    else callback(null, candidates[0].address, candidates[0].family);
  }, (error: Error) => callback(error, ""));
};
const agent = new Agent({ connect: { lookup: publicLookup, timeout: 8000 }, headersTimeout: 8000, bodyTimeout: 8000 });

/** Native fetch with DNS-pinned public connections. Redirects must be handled explicitly. */
export function publicFetch(value: string | URL, init: RequestInit): Promise<Response> {
  const url = assertPublicUrl(value);
  return fetch(url, { ...init, redirect: "manual", dispatcher: agent } as RequestInit & { dispatcher: Agent });
}
