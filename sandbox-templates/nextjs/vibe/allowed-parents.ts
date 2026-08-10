/**
 * Origins the inspector will talk to.
 *
 * The sandbox preview URL is public and unauthenticated, so this list — not the
 * `vibe_parent` query parameter — is the authority on who may drive the
 * inspector. A page that frames this sandbox with its own origin simply fails
 * to match and gets an inert, silent page.
 *
 * The Vibe app overwrites this file when it boots a sandbox, injecting the real
 * deployment origin. It is on the agent's read-only deny list.
 */
declare global {
  interface Window {
    /** Injected ahead of the prebuilt bundle for plain-HTML previews. */
    __VIBE_ALLOWED_PARENT_ORIGINS__?: string[];
  }
}

const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];

export const ALLOWED_PARENT_ORIGINS: string[] =
  typeof window !== "undefined" && Array.isArray(window.__VIBE_ALLOWED_PARENT_ORIGINS__)
    ? window.__VIBE_ALLOWED_PARENT_ORIGINS__
    : defaults;
