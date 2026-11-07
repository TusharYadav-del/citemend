import { readRequestJson } from "./read-request-json";
import { normalizeDashboardDomain } from "./audit-dashboard";

export const SUPPORT_CATEGORIES = ["bug_report", "redirect_help", "billing_question", "agency_partnership", "enterprise_security", "feature_request"] as const;
export type SupportCategory = typeof SUPPORT_CATEGORIES[number];
export type SupportPriority = "normal" | "high" | "urgent_agency";
export type SupportPlan = "starter" | "growth" | "pro" | "agency" | "enterprise" | "unknown";
export type SupportTicket = {
  workspace_domain: string | null;
  user_id: string;
  user_email: string;
  category: SupportCategory;
  priority: SupportPriority;
  subject: string;
  message: string;
  diagnostic_context_json: { latest_audit_id: string | null; browser_path: string; submitted_at: string };
  status: "open";
};
export type SupportSubmissionContext = { userId: string; userEmail: string; plan: SupportPlan };
export type SupportHandlerDependencies = {
  authenticate: (request: Request) => Promise<SupportSubmissionContext | null>;
  resolveWorkspace: (userId: string, domain: string) => Promise<{ domain: string; latestAuditId: string | null } | null>;
  save: (ticket: SupportTicket) => Promise<{ id: string }>;
  notify?: (ticket: SupportTicket & { id: string }) => Promise<boolean | "not_configured">;
  now?: () => Date;
};

export const supportSlaLabel = (plan: SupportPlan) => plan === "agency" || plan === "enterprise" ? "Under 4 hours · priority" : plan === "growth" || plan === "pro" ? "Under 12 hours" : "Within 24 hours";
const priorityFor = (plan: SupportPlan): SupportPriority => plan === "agency" || plan === "enterprise" ? "urgent_agency" : plan === "growth" || plan === "pro" ? "high" : "normal";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const cleanPath = (value: unknown) => {
  if (typeof value !== "string" || value.length > 500 || !value.startsWith("/")) return "/support";
  try { return new URL(value, "https://citemend.invalid").pathname.slice(0, 300); } catch { return "/support"; }
};

export function createSupportPostHandler(dependencies: SupportHandlerDependencies) {
  return async function POST(request: Request) {
    const user = await dependencies.authenticate(request).catch(() => null);
    if (!user) return json({ error: "Sign in to contact support." }, 401);
    if (!/^\S+@\S+\.\S+$/.test(user.userEmail)) return json({ error: "Add a verified account email before submitting a ticket." }, 400);
    const parsed = await readRequestJson(request, 12_000);
    if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return json({ error: "Send a valid support ticket." }, parsed.kind === "too_large" ? 413 : 400);
    const input = parsed.value as Record<string, unknown>;
    const category = input.category;
    const subject = typeof input.subject === "string" ? input.subject.trim() : "";
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (typeof category !== "string" || !(SUPPORT_CATEGORIES as readonly string[]).includes(category)) return json({ error: "Choose a supported ticket category." }, 400);
    if (subject.length < 4 || subject.length > 180) return json({ error: "Subject must be between 4 and 180 characters." }, 400);
    if (message.length < 12 || message.length > 8000) return json({ error: "Message must be between 12 and 8,000 characters." }, 400);
    let workspaceDomain: string | null = null;
    let latestAuditId: string | null = null;
    if (input.workspaceDomain !== undefined && input.workspaceDomain !== null && input.workspaceDomain !== "") {
      let requestedDomain: string;
      try { requestedDomain = normalizeDashboardDomain(typeof input.workspaceDomain === "string" ? input.workspaceDomain : ""); }
      catch { return json({ error: "Choose a valid workspace domain." }, 400); }
      const workspace = await dependencies.resolveWorkspace(user.userId, requestedDomain).catch(() => null);
      if (!workspace) return json({ error: "That workspace is not available to your account." }, 404);
      workspaceDomain = workspace.domain;
      latestAuditId = workspace.latestAuditId;
    }
    const ticket: SupportTicket = {
      workspace_domain: workspaceDomain,
      user_id: user.userId,
      user_email: user.userEmail,
      category: category as SupportCategory,
      priority: priorityFor(user.plan),
      subject,
      message,
      diagnostic_context_json: { latest_audit_id: latestAuditId, browser_path: cleanPath(input.browserPath), submitted_at: (dependencies.now ?? (() => new Date()))().toISOString() },
      status: "open",
    };
    let saved: { id: string };
    try { saved = await dependencies.save(ticket); }
    catch { return json({ error: "Your ticket could not be saved. Please retry." }, 503); }
    let notification: "sent" | "not_configured" | "failed" = "not_configured";
    if (dependencies.notify) {
      try { const result = await dependencies.notify({ ...ticket, id: saved.id }); notification = result === "not_configured" ? result : result ? "sent" : "failed"; }
      catch { notification = "failed"; }
    }
    return json({ ticketId: saved.id, status: "open", expectedResponse: supportSlaLabel(user.plan), notification }, 201);
  };
}
