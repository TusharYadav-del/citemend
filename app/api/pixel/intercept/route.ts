import { createPixelInterceptHandler, interceptOptions } from "@/lib/pixel-intercept";

export const maxDuration = 20;
export const GET = createPixelInterceptHandler();
export const POST = GET;
export const OPTIONS = interceptOptions;
