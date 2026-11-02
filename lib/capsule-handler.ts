import "server-only";
import { CapsuleError, generateCitationCapsule, validateCapsuleInput } from "./citation-capsule";
import { hasProSubscription } from "./subscription";
import { openCapsuleSchema, sealCapsuleSchema } from "./capsule-token";

type Dependencies = { isConfigured?: () => boolean; getUserId?: () => Promise<string | null>; hasPro?: typeof hasProSubscription; generate?: typeof generateCitationCapsule; tokenSecret?: () => string };
async function readInput(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new CapsuleError("Use Content-Type: application/json.", 415);
  const reader = request.body?.getReader(); if (!reader) throw new CapsuleError("JSON input is required.",400);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CapsuleError("The request upload timed out.",408)),5000); });
  try {
    let bytes = 0; const chunks: Uint8Array[] = [];
    while (true) { const {done,value} = await Promise.race([reader.read(),deadline]); if (done) break; bytes += value.byteLength; if (bytes > 24_576) throw new CapsuleError("The capsule request is too large.",413); chunks.push(value); }
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));
  } catch (error) { void reader.cancel().catch(() => {}); if (error instanceof CapsuleError) throw error; throw new CapsuleError("Invalid JSON input.",400); }
  finally { clearTimeout(timer); reader.releaseLock(); }
}
export function createCapsuleHandler(dependencies: Dependencies = {}) {
  const getUserId = dependencies.getUserId ?? (async () => (await (await import("@clerk/nextjs/server")).auth()).userId);
  const configured = dependencies.isConfigured ?? (() => Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY));
  const hasPro = dependencies.hasPro ?? hasProSubscription;
  const generate = dependencies.generate ?? generateCitationCapsule;
  const secret = dependencies.tokenSecret ?? (() => process.env.CAPSULE_SIGNING_SECRET || process.env.CLERK_SECRET_KEY || "");
  const json = (value: unknown, status = 200) => Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
  return async function POST(request: Request): Promise<Response> {
    if (!configured()) return json({error:"Sign-in is not configured."},503);
    let userId: string | null;
    try { userId = await getUserId(); } catch { return json({error:"Authentication is temporarily unavailable."},503); }
    if (!userId) return json({error:"Sign in to generate a Citation Capsule.",code:"SIGN_IN_REQUIRED"},401);
    try {
      const raw = await readInput(request);
      const action = raw && typeof raw === "object" ? (raw as {action?: unknown}).action : undefined;
      if (action !== undefined && action !== "generate" && action !== "export-jsonld") throw new CapsuleError("Unknown capsule action.",400);
      const input = action === "export-jsonld" ? null : validateCapsuleInput(raw);
      let isPro: boolean;
      try { isPro = await hasPro(userId); } catch { return json({error:"Subscription status is temporarily unavailable."},503); }
      if (action === "export-jsonld") {
        if (!isPro) return json({error:"Upgrade to Pro to copy JSON-LD.",code:"PRO_REQUIRED"},403);
        const token = (raw as {exportToken?: unknown}).exportToken;
        if (typeof token !== "string") throw new CapsuleError("A capsule export token is required.",400);
        return json({jsonLdSchema:openCapsuleSchema(token,userId,secret())});
      }
      const result = await generate(input);
      const exportToken = sealCapsuleSchema(userId,result.jsonLdSchema,secret());
      return json({...result, jsonLdSchema:isPro ? result.jsonLdSchema : null, canCopyJsonLd:isPro, exportToken});
    } catch (error) {
      return json({error:error instanceof CapsuleError ? error.message : "Capsule generation is temporarily unavailable."},error instanceof CapsuleError ? error.status : 502);
    }
  };
}
