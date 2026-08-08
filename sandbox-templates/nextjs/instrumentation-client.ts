/**
 * Loads the Vibe inspector.
 *
 * `instrumentation-client.ts` is a Next 15.3 root entry that runs before any
 * app code hydrates, on every route, independent of the route tree. That
 * matters: `app/layout.tsx` is squarely inside the code agent's blast radius,
 * so a <script> tag there would not survive the first layout regeneration.
 *
 * Guarded three ways — dev only, browser only, framed only — so the raw sandbox
 * URL and the published static export both ship without it.
 */
if (
  process.env.NODE_ENV === "development" &&
  typeof window !== "undefined" &&
  window.parent !== window
) {
  import("./vibe/inspector")
    .then((m) => m.start())
    .catch(() => {
      /* inspector is best-effort; never break the user's app */
    });
}
