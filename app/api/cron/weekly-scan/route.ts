import { after } from "next/server";
import { createWeeklyScanHandler } from "@/lib/weekly-scan";

export const maxDuration = 300;
export const GET = createWeeklyScanHandler({ defer: after });
export const POST = GET;
