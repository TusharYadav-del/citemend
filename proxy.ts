import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (request.nextUrl.pathname === "/dashboard" || request.nextUrl.pathname.startsWith("/dashboard/")) {
    await auth.protect();
  }
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.pathname === "/api/cron/weekly-scan"
      || request.nextUrl.pathname === "/api/pixel/resolve") return NextResponse.next();
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return NextResponse.next();
  }
  return clerkHandler(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
