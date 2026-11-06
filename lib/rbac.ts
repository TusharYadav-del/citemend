export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";
export type WorkspaceAction = "read" | "scan" | "draft" | "propose_redirect" | "approve_redirect" | "manage_integrations" | "invite_members" | "manage_billing" | "manage_api_keys" | "manage_retention" | "export_workspace" | "delete_workspace";
const grants: Record<WorkspaceRole, readonly WorkspaceAction[]> = {
  viewer: ["read"], editor: ["read", "scan", "draft", "propose_redirect"], admin: ["read", "scan", "draft", "propose_redirect", "approve_redirect", "manage_integrations", "invite_members", "manage_retention"], owner: ["read", "scan", "draft", "propose_redirect", "approve_redirect", "manage_integrations", "invite_members", "manage_billing", "manage_api_keys", "manage_retention", "export_workspace", "delete_workspace"],
};
export function canWorkspace(role: string, action: WorkspaceAction) { return role in grants && grants[role as WorkspaceRole].includes(action); }
export function resolveOrganizationRole(claim: unknown, membershipRole?: string | null): WorkspaceRole | null { const raw = typeof claim === "string" ? claim.replace(/^org:/, "") : membershipRole; return raw && raw in grants ? raw as WorkspaceRole : null; }
