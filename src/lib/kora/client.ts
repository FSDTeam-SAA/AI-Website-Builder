export type Website = {
  _id: string;
  name: string;
  status: string;
  updatedAt: string;
  domain?: string;
  publishedVersion?: number;
  publishedAt?: string;
  publicSlug?: string;
  __v: number;
  brandKit_id?: string | null;
};
export type WebsitePage = {
  _id: string;
  website_id: string;
  title: string;
  slug: string;
  html: string;
  css: string;
  __v: number;
  status: "draft" | "published";
  kind: "page" | "landing" | "legal" | "blog_index";
  updatedAt: string;
  showInNav: boolean;
  seo?: { title?: string; description?: string; noindex?: boolean };
};
export type NavigationItem = {
  pageId: string;
  label: string;
  visible: boolean;
  depth: number;
};
export type WebsiteNavigation = { items: NavigationItem[]; version: number };
export type WebsiteProposal = {
  _id: string;
  page_id: string;
  baseVersion: number;
  html: string;
  css: string;
  summary: string[];
  status: "proposed" | "applied" | "discarded";
};
export type WebsiteMessage = {
  page_id?: string;
  _id: string;
  role: "user" | "kora";
  content: string;
  createdAt: string;
  proposal_id?: WebsiteProposal | null;
};
export type WebsiteReleases = {
  releases: { version: number; note: string; createdAt: string }[];
  publishedVersion?: number;
  status: string;
  publicSlug?: string;
};
export type WebsiteAsset = {
  _id: string;
  name: string;
  file: { url: string; width?: number; height?: number };
};
export type WebsiteAIModels = { defaultId: string; models: { id: string; provider: string; label: string; available: boolean }[] };
export type WebsiteBrand = {
  _id: string;
  name: string;
  colors: { name: string; hex: string; role: string }[];
  typography: { heading: string; body: string };
};
export type WebsiteComment = {
  _id: string;
  page_id: string;
  content: string;
  kind: "comment" | "note";
  resolved: boolean;
  authorName: string;
  createdAt: string;
};
export type BuilderContext = {
  organization: { id: string; name: string };
  actor: { id: string; name: string };
  capabilities: { write: boolean };
};
export class KoraApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function koraRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/kora/${path}`, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new KoraApiError(
      result.message || "The request failed. Please retry.",
      response.status,
    );
  return result.data as T;
}

export function previewDocument(html: string, css: string) {
  // No scripts, forms, parent access, network fetches or external stylesheets.
  // Escape style delimiters even though the backend independently rejects them.
  const safeCss = css.replace(/</g, "\\3c ").replace(/>/g, "\\3e ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; form-action 'none'; base-uri 'none'"><style>body{margin:0;overflow-wrap:break-word}*{box-sizing:border-box}${safeCss}</style></head><body>${html}</body></html>`;
}
