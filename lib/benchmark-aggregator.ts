import { wilsonConfidenceInterval } from "@/lib/predictive-decay";

export type BenchmarkEvidenceRow = {
  workspaceKey: string;
  workspaceDomain: string;
  allowBenchmarkAggregation: boolean;
  modelName: string;
  jobStatus: string;
  extractedUrls: unknown;
  urlStatus: unknown;
};

export type PublicBenchmarkResult = {
  available: boolean;
  note: string;
  model404Rates: { model: string; rate: number; confidenceInterval: ReturnType<typeof wilsonConfidenceInterval> }[];
  forensicCauses: { cause: string; rate: number; confidenceInterval: ReturnType<typeof wilsonConfidenceInterval> }[];
};

function hostOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

function statusCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/\b([1-5]\d\d)\b/);
    return match ? Number(match[1]) : null;
  }
  return null;
}

function urlsIn(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(hostOf(item))) : [];
}

function statusesIn(value: unknown): [string, unknown][] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [];
}

function statusMatchesUrl(statusUrl: string, candidate: string): boolean {
  try { return new URL(statusUrl).href === new URL(candidate).href; } catch { return false; }
}

function analyze(row: BenchmarkEvidenceRow) {
  const domain = row.workspaceDomain.toLowerCase().replace(/^www\./, "");
  const urls = urlsIn(row.extractedUrls);
  const ownUrls = urls.filter((url) => {
    const host = hostOf(url);
    return host === domain || host?.endsWith(`.${domain}`);
  });
  const checked = statusesIn(row.urlStatus).filter(([statusUrl]) => ownUrls.some((url) => statusMatchesUrl(statusUrl, url)));
  const broken = checked.some(([, status]) => {
    const code = statusCode(status);
    return code === 404 || code === 410 || (typeof status === "string" && /timeout/i.test(status));
  });
  const hasStatusEvidence = checked.some(([, status]) => statusCode(status) !== null || (typeof status === "string" && /timeout/i.test(status)));
  const cause = broken ? "broken_destination" : urls.length === 0 ? "retrieval" : ownUrls.length === 0 ? "citation_selection" : null;
  return { broken, hasStatusEvidence, cause };
}

/**
 * Aggregates completed observations only when each published slice has five
 * distinct, explicitly opted-in workspaces. No domains, prompts, or IDs escape.
 */
export function buildPublicVerifiedBenchmarks(rows: BenchmarkEvidenceRow[]): PublicBenchmarkResult {
  const completed = rows.filter((row) => row.allowBenchmarkAggregation === true && row.jobStatus === "completed" && Boolean(row.workspaceKey) && Boolean(row.workspaceDomain) && Boolean(row.modelName.trim()));
  if (new Set(completed.map((row) => row.workspaceKey)).size < 5) {
    return { available: false, note: "Benchmarks are hidden until at least five distinct workspaces opt in and contribute verified observations.", model404Rates: [], forensicCauses: [] };
  }

  const analyzed = completed.map((row) => ({ row, ...analyze(row) }));
  const modelGroups = new Map<string, typeof analyzed>();
  for (const item of analyzed) if (item.hasStatusEvidence) {
    const group = modelGroups.get(item.row.modelName) ?? [];
    group.push(item);
    modelGroups.set(item.row.modelName, group);
  }
  const model404Rates = [...modelGroups.entries()].flatMap(([model, group]) => {
    if (new Set(group.map(({ row }) => row.workspaceKey)).size < 5) return [];
    const broken = group.filter((item) => item.broken).length;
    return [{ model, rate: broken / group.length * 100, confidenceInterval: wilsonConfidenceInterval(broken, group.length) }];
  }).sort((a, b) => a.model.localeCompare(b.model));

  const causeGroups = new Map<string, typeof analyzed>();
  for (const item of analyzed) if (item.cause) {
    const group = causeGroups.get(item.cause) ?? [];
    group.push(item);
    causeGroups.set(item.cause, group);
  }
  const forensicCauses = [...causeGroups.entries()].flatMap(([cause, group]) => {
    if (new Set(group.map(({ row }) => row.workspaceKey)).size < 5) return [];
    return [{ cause, rate: group.length / completed.length * 100, confidenceInterval: wilsonConfidenceInterval(group.length, completed.length) }];
  }).sort((a, b) => b.rate - a.rate || a.cause.localeCompare(b.cause));

  return {
    available: true,
    note: "Aggregates use completed observations from explicitly opted-in workspaces only. Cause labels describe public evidence patterns, not private model reasoning.",
    model404Rates,
    forensicCauses,
  };
}
