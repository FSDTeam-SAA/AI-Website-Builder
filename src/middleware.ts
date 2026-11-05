import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";

/**
 * `/p/*` is the published-site surface and must resolve for signed-out
 * visitors — a share link that demands a login is not a share link.
 *
 * `/api/*` stays public at this layer because the Inngest endpoint must be
 * reachable by the runner. It is not a security hole: every tRPC procedure is a
 * `protectedProcedure` and additionally scopes its queries by userId.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api(.*)",
  "/pricing(.*)",
  "/p/(.*)",
]);

const legacyMiddleware = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (request.nextUrl.pathname.startsWith("/site/")) return NextResponse.next();
  if (
    request.nextUrl.pathname === "/website-builder" ||
    request.nextUrl.pathname.startsWith("/api/kora/")
  )
    return NextResponse.next();
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    if (request.nextUrl.pathname.startsWith("/p/")) return NextResponse.next();
    if (request.nextUrl.pathname.startsWith("/api/"))
      return NextResponse.json(
        { message: "Legacy builder authentication is not configured." },
        { status: 503 },
      );
    return NextResponse.redirect(new URL("/website-builder", request.url));
  }
  return legacyMiddleware(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
