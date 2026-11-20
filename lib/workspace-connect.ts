import { canWorkspace, type WorkspaceRole } from "./rbac";
import { mergeWorkspaceDomain } from "./workspace-domain";

type Identity = { userId: string | null; ownerUserId?: string; role?: WorkspaceRole };
type Dependencies = {
  authenticate: () => Promise<Identity>;
  save: (ownerUserId: string, domain: string) => Promise<void>;
};

export function createWorkspaceConnectHandler({ authenticate, save }: Dependencies) {
  return async function handle(request: Request): Promise<Response> {
    let identity: Identity;
    try { identity = await authenticate(); }
    catch { return Response.json({ error: "Workspace authentication is temporarily unavailable." }, { status: 503 }); }
    if (!identity.userId) return Response.json({ error: "Sign in to connect a workspace." }, { status: 401 });
    if (!canWorkspace(identity.role ?? "viewer", "manage_integrations")) return Response.json({ error: "Only workspace owners and admins can connect a domain." }, { status: 403 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Send a valid JSON body with a domain." }, { status: 400 }); }
    if (!body || typeof body !== "object" || typeof (body as { domain?: unknown }).domain !== "string") {
      return Response.json({ error: "Enter a domain to connect." }, { status: 400 });
    }

    let domain: string;
    try { ({ domain } = mergeWorkspaceDomain([], (body as { domain: string }).domain)); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Enter a valid public domain." }, { status: 400 }); }
    try {
      await save(identity.ownerUserId ?? identity.userId, domain);
      return Response.json({ domain, connected: true }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown storage error.";
      return Response.json({ error: `Could not save workspace: ${detail}` }, { status: 503 });
    }
  };
}
