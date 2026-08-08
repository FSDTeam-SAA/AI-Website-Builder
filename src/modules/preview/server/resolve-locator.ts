import type { VibeElementLocator } from "@/modules/preview/protocol";
import { normalizeFilePath, type ProjectFiles } from "@/lib/project-files";

export interface SourceCandidate {
  path: string;
  /** 1-based line the element most likely starts on, when known. */
  line: number | null;
  score: number;
  reasons: string[];
  /** A short excerpt around `line`, for display and for prompt context. */
  snippet: string;
}

export interface ResolvedLocator {
  /** Parsed from `loc` when the build-time attribute was present. */
  exact: { path: string; line: number; column: number } | null;
  candidates: SourceCandidate[];
  /** Convenience: the best candidate, or null when nothing scored. */
  best: SourceCandidate | null;
}

/** Tailwind-ish utility classes carry no locating signal — they're everywhere. */
const UTILITY_CLASS = /^(?:-?(?:sm|md|lg|xl|2xl|hover|focus|active|dark|group|peer|first|last|odd|even|disabled|motion-safe|motion-reduce):)*-?(?:m|p)[trblxy]?-|^(?:flex|grid|block|inline|hidden|absolute|relative|fixed|sticky|static|w|h|min|max|gap|space|text|font|bg|border|rounded|shadow|opacity|z|overflow|items|justify|content|self|order|col|row|transition|duration|ease|transform|translate|scale|rotate|cursor|select|pointer|leading|tracking|whitespace|truncate|line|list|object|aspect|container|mx|my|px|py|pt|pb|pl|pr|mt|mb|ml|mr|top|bottom|left|right|inset|size)(?:-|$)/;

function isDistinctiveClass(cls: string): boolean {
  if (cls.length < 6) return false;
  if (UTILITY_CLASS.test(cls)) return false;
  if (/^\[.*\]$/.test(cls)) return false; // arbitrary value
  return true;
}

/** "HeroSection" -> ["hero-section", "herosection", "hero_section"] */
function componentNameVariants(name: string): string[] {
  const kebab = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
  return [kebab, name.toLowerCase(), kebab.replace(/-/g, "_"), kebab.replace(/-/g, "")];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function basenameNoExt(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.[^.]+$/, "");
}

function snippetAround(content: string, line: number | null, radius = 6): string {
  const lines = content.split("\n");
  if (line === null) return lines.slice(0, Math.min(lines.length, radius * 2)).join("\n");
  const from = Math.max(0, line - 1 - radius);
  const to = Math.min(lines.length, line - 1 + radius);
  return lines
    .slice(from, to)
    .map((text, i) => `${String(from + i + 1).padStart(4, " ")} | ${text}`)
    .join("\n");
}

function firstLineContaining(content: string, needle: string): number | null {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return null;
}

/** Source files worth searching — generated apps keep their code under app/. */
function isSearchableSource(path: string): boolean {
  if (!/\.(tsx|jsx|ts|js)$/.test(path)) return false;
  if (path.startsWith("node_modules/")) return false;
  // shadcn primitives are vendored and identical across every project; an
  // element's own source is essentially never in here.
  if (path.startsWith("components/ui/")) return false;
  return true;
}

/**
 * Map a clicked DOM element to the source that rendered it.
 *
 * React 19 removed `fiber._debugSource`, so there is no runtime file/line to
 * read. When the build-time `data-vibe-loc` attribute is present we use it
 * directly; otherwise we score every source file against the signals the
 * inspector could collect. Generated apps are small (10-40 files) and the
 * prompt mandates one component per kebab-case file, which makes the
 * component-name signal unusually reliable here.
 */
export function resolveLocator(
  locator: VibeElementLocator,
  files: ProjectFiles,
): ResolvedLocator {
  // --- exact path ---------------------------------------------------------
  if (locator.loc) {
    const match = locator.loc.match(/^(.*):(\d+):(\d+)$/);
    if (match) {
      const path = normalizeFilePath(match[1]);
      const line = Number(match[2]);
      const column = Number(match[3]);
      const content = files[path];
      if (content) {
        const candidate: SourceCandidate = {
          path,
          line,
          score: 1000,
          reasons: ["build-time source attribute"],
          snippet: snippetAround(content, line),
        };
        return { exact: { path, line, column }, candidates: [candidate], best: candidate };
      }
    }
  }

  // --- heuristic scoring --------------------------------------------------
  const innermost = locator.componentChain.at(-1) ?? null;
  const chain = locator.componentChain.slice(-4);
  const exactText = (locator.text ?? "").trim();
  const distinctiveClasses = (locator.className ?? "")
    .split(/\s+/)
    .filter(isDistinctiveClass)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);

  const candidates: SourceCandidate[] = [];

  for (const path of Object.keys(files)) {
    if (!isSearchableSource(path)) continue;
    const content = files[path];
    let score = 0;
    const reasons: string[] = [];
    let line: number | null = null;

    // Filename matches a component in the owner chain.
    const base = basenameNoExt(path).toLowerCase();
    for (const name of chain) {
      if (componentNameVariants(name).includes(base)) {
        const weight = name === innermost ? 100 : 45;
        score += weight;
        reasons.push(`filename matches <${name}>`);
        break;
      }
    }

    // The component is actually declared here.
    for (const name of chain) {
      const declRe = new RegExp(
        `(?:export\\s+(?:default\\s+)?(?:function|const|class)\\s+${escapeRegExp(name)}\\b)` +
          `|(?:(?:const|function|class)\\s+${escapeRegExp(name)}\\b)`,
      );
      if (declRe.test(content)) {
        const weight = name === innermost ? 100 : 40;
        score += weight;
        reasons.push(`declares ${name}`);
        line = firstLineContaining(content, name) ?? line;
        break;
      }
    }

    // The literal visible text appears in this file.
    if (exactText.length >= 2 && content.includes(exactText)) {
      score += 60;
      reasons.push("contains the element's text");
      line = firstLineContaining(content, exactText) ?? line;
    }

    // A distinctive (non-utility) class name appears here.
    for (const cls of distinctiveClasses) {
      if (content.includes(cls)) {
        score += 25;
        reasons.push(`contains class "${cls}"`);
        line = line ?? firstLineContaining(content, cls);
        break;
      }
    }

    // A whitelisted attribute value appears alongside the tag.
    for (const [key, value] of Object.entries(locator.attributes)) {
      if (!value || value.length < 4) continue;
      if (key === "class" || key === "style") continue;
      if (content.includes(value)) {
        score += 15;
        reasons.push(`contains ${key}="${value.slice(0, 30)}"`);
        line = line ?? firstLineContaining(content, value);
        break;
      }
    }

    // Weak tiebreaker: the page for the route being previewed.
    if (score > 0 && routeMatchesPath(locator.route, path)) {
      score += 10;
      reasons.push("matches the previewed route");
    }

    if (score > 0) {
      candidates.push({ path, line, score, reasons, snippet: snippetAround(content, line) });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const top = candidates.slice(0, 5);
  return { exact: null, candidates: top, best: top[0] ?? null };
}

function routeMatchesPath(route: string, path: string): boolean {
  const clean = route.split("?")[0].replace(/^\/+|\/+$/g, "");
  if (!clean) return path === "app/page.tsx" || path === "app/page.jsx";
  return path.startsWith(`app/${clean}/page.`);
}
