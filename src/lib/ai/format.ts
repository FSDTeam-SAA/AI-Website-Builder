/**
 * Display helpers for token counts and costs.
 *
 * Dependency-free on purpose. `usage-meter.ts` imports the model registry,
 * which imports `@inngest/agent-kit` and therefore Node-only modules
 * (`async_hooks` via OpenTelemetry) — importing a formatter from there into a
 * client component drags all of that into the browser bundle and breaks the
 * build.
 */

export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}
