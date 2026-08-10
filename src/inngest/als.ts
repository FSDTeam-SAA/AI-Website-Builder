import "server-only";

/**
 * Escape hatch out of Inngest's per-execution async context.
 *
 * The SDK keeps its execution context in a process-global `AsyncLocalStorage`
 * registered under a `Symbol.for` key, deliberately so that separate copies of
 * the SDK share one instance. That global is the only handle on it — nothing
 * public exposes the store — so we read it by the same key and treat anything
 * unexpected as "not in an Inngest run".
 */

const ALS_KEY = Symbol.for("inngest:als");

interface ExitCapable {
  exit<T>(fn: () => T): T;
}

function isExitCapable(value: unknown): value is ExitCapable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ExitCapable).exit === "function"
  );
}

/**
 * Run an agent-kit network with Inngest's step tooling hidden from it.
 *
 * agent-kit looks for step tooling before every inference and, when it finds
 * any, routes the call through `step.ai.infer` instead of calling the provider
 * itself. Inside a `step.run` that deadlocks: an AI-gateway step carries no
 * locally executable function, so the SDK reports it and hands back a promise
 * only Inngest can settle — which cannot happen until the enclosing step
 * returns. Every run hung on its first inference and ended only when the user
 * pressed Stop.
 *
 * Running inline is also what we want on the merits. Our tools are plain async
 * handlers rather than Inngest functions, so nothing memoises them; each step
 * round-trip would replay their writes and the agent would rewrite the same
 * files once per iteration.
 */
export async function withoutStepTools<T>(fn: () => Promise<T>): Promise<T> {
  const als = await Promise.resolve(
    (globalThis as Record<symbol, unknown>)[ALS_KEY],
  ).catch(() => null);

  // Not inside an Inngest execution, or a runtime without `async_hooks` — where
  // the store is always empty and agent-kit already takes the direct path.
  if (!isExitCapable(als)) return fn();

  return als.exit(fn);
}
