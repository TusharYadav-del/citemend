import { createVerifyFixHandler } from "@/lib/verify-fix-handler";
import { readRequestJson } from "@/lib/read-request-json";

export const POST = createVerifyFixHandler({ readJson: readRequestJson });
