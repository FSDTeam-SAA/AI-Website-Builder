const FALLBACK_TITLE = "Untitled Project";
const MAX_TITLE_LENGTH = 60;
const MAX_WORDS = 8;

const LOWERCASE_WORDS = new Set(["a", "an", "and", "at", "for", "from", "in", "of", "on", "the", "to", "with"]);
const SPECIAL_CASES: Record<string, string> = {
  ai: "AI",
  api: "API",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  js: "JS",
  nextjs: "Next.js",
  react: "React",
  saas: "SaaS",
  sql: "SQL",
  ts: "TS",
  typescript: "TypeScript",
  ui: "UI",
  ux: "UX",
};

/**
 * Turn the first user prompt into an immediate, human-readable project name.
 *
 * Project creation must stay fast, so this deliberately avoids another model
 * call. It removes conversational boilerplate, keeps the meaningful first
 * clause and applies conservative title casing.
 */
export function projectTitleFromPrompt(prompt: string): string {
  let value = prompt
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[*_#>`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // The first sentence normally contains the actual build request; later
  // sentences tend to be implementation details.
  value = value.split(/(?:[.!?](?:\s|$)|\n)/, 1)[0]?.trim() ?? "";

  const prefixes = [
    /^(?:please\s+)?(?:can|could|would)\s+you\s+/i,
    /^(?:please\s+)?(?:let(?:'|’)?s|let\s+us)\s+/i,
    /^(?:please\s+)?i\s+(?:want|need|would\s+like)\s+(?:you\s+)?to\s+/i,
    /^(?:please\s+)?(?:build|create|design|develop|generate|implement|make|code)\s+(?:me\s+)?/i,
    /^(?:a|an|the)\s+/i,
  ];

  // Prefixes can stack ("Can you make me a ..."), so keep peeling until no
  // rule applies.
  let changed = true;
  while (changed && value) {
    changed = false;
    for (const prefix of prefixes) {
      const next = value.replace(prefix, "").trim();
      if (next !== value) {
        value = next;
        changed = true;
      }
    }
  }

  const words = value
    .replace(/[^\p{L}\p{N}+'’.-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_WORDS);

  if (words.length === 0) return FALLBACK_TITLE;

  const title = words
    .map((word, index) => {
      const normalized = word.toLocaleLowerCase("en-US");
      if (SPECIAL_CASES[normalized]) return SPECIAL_CASES[normalized];
      if (index > 0 && LOWERCASE_WORDS.has(normalized)) return normalized;
      return normalized.charAt(0).toLocaleUpperCase("en-US") + normalized.slice(1);
    })
    .join(" ");

  if (title.length <= MAX_TITLE_LENGTH) return title;
  return title.slice(0, MAX_TITLE_LENGTH + 1).replace(/\s+\S*$/, "").trim() || FALLBACK_TITLE;
}
