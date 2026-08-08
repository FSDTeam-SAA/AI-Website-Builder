import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
