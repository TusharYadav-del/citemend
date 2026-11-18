import { createRecoveryQaCronHandler } from "@/lib/recovery/qa-cron";

export const maxDuration = 300;
const run = createRecoveryQaCronHandler();

// Vercel Cron uses GET; POST remains available for the protected manual trigger.
export const GET = run;
export const POST = run;
