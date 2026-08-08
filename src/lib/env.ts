import { z } from "zod";

/**
 * Typed, validated environment access.
 *
 * Server variables are validated lazily (on first read) rather than at import
 * time, so that importing this module from a client component or from the edge
 * middleware runtime can never throw for variables that context cannot see.
 *
 * NEXT_PUBLIC_* variables must be referenced as static literal property
 * accesses — Next.js inlines them at build time and dynamic lookups come back
 * undefined in the browser.
 */

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const clientParsed = clientSchema.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

if (!clientParsed.success) {
  // Non-fatal: fall through to defaults rather than breaking the render.
  console.warn(
    "[env] invalid public environment:",
    z.treeifyError(clientParsed.error),
  );
}

export const clientEnv = clientParsed.success
  ? clientParsed.data
  : clientSchema.parse({});

/** Origin of this app, without a trailing slash. */
export function getAppOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  OPENAI_API_KEY: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),
  GROK_API_KEY: z.string().default(""),

  AI_MODEL_CODE: z.string().default("gpt-5.6-terra"),
  AI_MODEL_EDIT: z.string().default("gpt-5.6-terra"),
  AI_MODEL_FAST: z.string().default("gpt-5.6-luna"),

  E2B_API_KEY: z.string().min(1, "E2B_API_KEY is required"),
  E2B_TEMPLATE_ID: z.string().default("vibe-nextjs-test-2"),

  STORAGE_DRIVER: z.enum(["db", "s3"]).default("db"),
  S3_BUCKET: z.string().default(""),
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: z.string().default(""),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  S3_PUBLIC_BASE_URL: z.string().default(""),

  USAGE_ENFORCEMENT: boolish,
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Validated server environment. Throws a single readable error listing every
 * problem, rather than failing deep inside an SDK with an opaque message.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }

  if (parsed.data.STORAGE_DRIVER === "s3" && !parsed.data.S3_BUCKET) {
    throw new Error(
      "Invalid server environment:\n  - S3_BUCKET is required when STORAGE_DRIVER=s3",
    );
  }

  cached = parsed.data;
  return cached;
}

/** Origins the sandbox inspector will exchange postMessage traffic with. */
export function allowedParentOrigins(): string[] {
  const origins = new Set<string>([
    getAppOrigin(),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  return [...origins].filter(Boolean);
}
