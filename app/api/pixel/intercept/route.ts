import { createPixelInterceptHandler, interceptOptions } from "@/lib/pixel-intercept";
import { after } from "next/server";
import { notifyWorkspace } from "@/lib/alerts";

export const maxDuration = 20;
export const GET = createPixelInterceptHandler({ notify: (domain, source, brokenPath, targetUrl) => {
  after(async () => { try { await notifyWorkspace(domain, { kind: "rescue", source, brokenPath, targetPath: new URL(targetUrl).pathname }); } catch { console.error("Rescue alert could not be delivered."); } });
} });
export const POST = GET;
export const OPTIONS = interceptOptions;
