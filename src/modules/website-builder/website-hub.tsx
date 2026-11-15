"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Code2,
  Copy,
  FileText,
  Files,
  Globe,
  Grid2X2,
  LayoutTemplate,
  List,
  Monitor,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  koraRequest,
  previewDocument,
  type Website,
  type WebsitePage,
  type WebsiteNavigation,
} from "@/lib/kora/client";

type Props = {
  modelId: string;
  site: Website;
  pages: WebsitePage[];
  section: "overview" | "pages";
  canWrite: boolean;
  busy: boolean;
  onSection: (section: "overview" | "pages") => void;
  onEdit: (page: WebsitePage | null) => void;
  onPages: (pages: WebsitePage[]) => void;
  onBusy: (label: string) => void;
  onError: (error: unknown) => void;
};
const date = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "Not yet";
function PagePreview({
  page,
  className = "",
}: {
  page: WebsitePage | null;
  className?: string;
}) {
  return (
    <div className={`wh-thumbnail ${className}`}>
      {page ? (
        <iframe
          title={`${page.title} thumbnail`}
          aria-hidden="true"
          tabIndex={-1}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={previewDocument(page.html, page.css)}
        />
      ) : (
        <div className="wh-no-preview">
          <Globe size={28} />
          <span>Your website starts here</span>
        </div>
      )}
    </div>
  );
}
function score(page: WebsitePage) {
  return (
    ((Number(!!page.seo?.title) +
      Number(!!page.seo?.description) +
      Number(/<h1[\s>]/i.test(page.html))) *
      100) /
    3
  );
}
const templateCss =
  "body{margin:0;font-family:Arial,sans-serif;background:#0c0e11;color:#f5f3ef}main{max-width:1100px;margin:auto;padding:80px 48px}header{border-bottom:1px solid #313134;padding:24px 48px;color:#d3b17a}h1{font-size:clamp(36px,6vw,70px);line-height:1.1;max-width:760px}p{color:#aeb0b8;line-height:1.8;max-width:600px}section{padding:48px 0;border-top:1px solid #313134}a{color:#e3c393}footer{padding:24px 48px;color:#94969e}@media(max-width:600px){main{padding:48px 24px}header,footer{padding:24px}}";
const templates = [
  {
    id: "business",
    name: "Business introduction",
    html: "<header>Your business</header><main><h1>Made for your next chapter.</h1><p>Thoughtful service, personal attention and a business built around you.</p><section><h2>What we do</h2><p>Introduce your services and explain what makes your business different.</p></section><section><h2>Let’s talk</h2><p>Replace this text with your contact details.</p></section></main><footer>Your business</footer>",
  },
  {
    id: "services",
    name: "Services",
    html: "<header>Our services</header><main><h1>Expertise you can count on.</h1><p>Discover the right service for you.</p><section><h2>Your first service</h2><p>Describe the experience, duration and value.</p></section><section><h2>Your second service</h2><p>Describe what is included and who it is for.</p></section></main>",
  },
  {
    id: "contact",
    name: "Contact",
    html: "<header>Get in touch</header><main><h1>We’d love to hear from you.</h1><p>Add your business address, email and phone number here.</p><section><h2>Visit us</h2><p>Add your location and directions.</p></section><section><h2>Opening hours</h2><p>Add your current opening hours.</p></section></main>",
  },
];

export function WebsiteHub(props: Props) {
  const { site, pages, busy, canWrite } = props;
  const [selectedId, setSelectedId] = useState(pages[0]?._id || "");
  const selected =
    pages.find((page) => page._id === selectedId) || pages[0] || null;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("updated");
  const [list, setList] = useState(false);
  const [tab, setTab] = useState<"pages" | "navigation">("pages");
  const [navigation, setNavigation] = useState<WebsiteNavigation | null>(null);
  const [navDirty, setNavDirty] = useState(false);
  const [dialog, setDialog] = useState<
    "choice" | "manual" | "kora" | "template" | "settings" | "duplicate" | null
  >(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState("business");
  const [seoTitle, setSeoTitle] = useState("");
  const [description, setDescription] = useState("");
  const [noindex, setNoindex] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (tab !== "navigation") return;
    let active = true;
    koraRequest<WebsiteNavigation>(`websites/${site._id}/navigation`)
      .then((result) => {
        if (active) {
          setNavigation(result);
          setNavDirty(false);
        }
      })
      .catch(props.onError);
    return () => {
      active = false;
    };
  }, [tab, site._id, pages.length, props.onError]);

  async function run(label: string, operation: () => Promise<void>) {
    props.onBusy(label);
    setNotice("");
    try {
      await operation();
    } catch (error) {
      props.onError(error);
    } finally {
      props.onBusy("");
    }
  }
  function create() {
    let candidate = "new-page",
      index = 2;
    while (pages.some((page) => page.slug === candidate))
      candidate = `new-page-${index++}`;
    setTitle("");
    setSlug(candidate);
    setPrompt("");
    setDialog("choice");
  }
  function settings(duplicate = false) {
    if (!selected) return;
    setTitle(
      duplicate ? `${selected.title} copy`.slice(0, 120) : selected.title,
    );
    setSlug(
      duplicate
        ? `${selected.slug.slice(0, 85)}-copy-${pages.length + 1}`
        : selected.slug,
    );
    setSeoTitle(selected.seo?.title || "");
    setDescription(selected.seo?.description || "");
    setNoindex(!!selected.seo?.noindex);
    setDialog(duplicate ? "duplicate" : "settings");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    await run(
      dialog === "kora" ? "Kora is creating your page" : "Saving page",
      async () => {
        const base = `websites/${site._id}`;
        if (dialog === "settings" && selected) {
          const saved = await koraRequest<WebsitePage>(
            `${base}/pages/${selected._id}`,
            "PATCH",
            {
              title,
              slug,
              seo: { title: seoTitle, description, noindex },
              expectedVersion: selected.__v,
            },
          );
          props.onPages(
            pages.map((page) => (page._id === saved._id ? saved : page)),
          );
          setNotice("Page settings saved.");
        } else {
          const chosen = templates.find((item) => item.id === template)!;
          const target =
            dialog === "duplicate" && selected
              ? `pages/${selected._id}/duplicate`
              : dialog === "kora"
                ? "generate"
                : "pages";
          const body =
            dialog === "kora"
              ? { prompt, slug, modelId: props.modelId || undefined }
              : dialog === "duplicate"
                ? { title, slug }
                : {
                    title,
                    slug,
                    html:
                      dialog === "template"
                        ? chosen.html
                        : "<main><h1>Your new page</h1><p>Make this page your own in the editor.</p></main>",
                    css:
                      dialog === "template"
                        ? templateCss
                        : "body{font-family:system-ui;background:#fafafa;color:#18202c}main{padding:64px 32px}",
                  };
          const created = await koraRequest<WebsitePage>(
            `${base}/${target}`,
            "POST",
            body,
          );
          props.onPages([...pages, created]);
          setSelectedId(created._id);
          setNotice("New draft page created.");
        }
        setDialog(null);
      },
    );
  }
  async function remove() {
    if (
      !selected ||
      !window.confirm(
        `Delete the draft page “${selected.title}”? Any previously published snapshot is kept.`,
      )
    )
      return;
    await run("Deleting draft page", async () => {
      await koraRequest(
        `websites/${site._id}/pages/${selected._id}`,
        "DELETE",
        { expectedVersion: selected.__v },
      );
      props.onPages(pages.filter((page) => page._id !== selected._id));
      setNotice("Draft page deleted.");
    });
  }
  function move(index: number, delta: number) {
    if (!navigation) return;
    const items = [...navigation.items],
      target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    items[0] = { ...items[0], depth: 0 };
    setNavigation({ ...navigation, items });
    setNavDirty(true);
  }
  const filtered = pages
    .filter(
      (page) =>
        `${page.title} ${page.slug}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (status === "all" || page.status === status) &&
        (kind === "all" || page.kind === kind),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  const home = pages.find((page) => page.slug === "home") || pages[0] || null;

  return (
    <section className="wh-hub">
      <div className="wh-heading">
        <div>
          <h2>
            {props.section === "overview"
              ? "Website"
              : tab === "navigation"
                ? "Navigation Structure"
                : "Pages"}
          </h2>
          <p>
            {props.section === "overview"
              ? "Manage your website, pages, visibility and performance."
              : tab === "navigation"
                ? "Control the website menu without changing page content."
                : "Manage page structure, status and visibility. Creative edits open in the Editor."}
          </p>
        </div>
        {props.section === "pages" && (
          <div className="wh-heading-actions">
            <div className="wh-segment">
              <button
                aria-pressed={tab === "pages"}
                onClick={() => {
                  if (
                    !navDirty ||
                    window.confirm("Discard unsaved menu changes?")
                  )
                    setTab("pages");
                }}
              >
                Pages
              </button>
              <button
                aria-pressed={tab === "navigation"}
                onClick={() => setTab("navigation")}
              >
                Navigation
              </button>
            </div>
            <button
              aria-label="Create a page"
              disabled={busy || !canWrite}
              onClick={create}
            >
              <Plus size={19} />
            </button>
          </div>
        )}
      </div>
      {notice && (
        <p className="wh-saved" role="status">
          <Check size={14} />
          {notice}
        </p>
      )}
      {props.section === "overview" ? (
        <>
          <div className="wh-stats">
            {[
              {
                label: "Website pages",
                value: pages.length,
                detail: "Pages in your website",
              },
              {
                label: "Published pages",
                value: pages.filter((p) => p.status === "published").length,
                detail: "Last published page status",
              },
              {
                label: "Draft pages",
                value: pages.filter((p) => p.status === "draft").length,
                detail: "Ready for your review",
              },
              {
                label: "SEO essentials",
                value: pages.length
                  ? `${Math.round(pages.reduce((sum, p) => sum + score(p), 0) / pages.length)}%`
                  : "—",
                detail: "Title, description and H1 coverage",
              },
            ].map((stat, index) => (
              <article className="wh-stat" key={stat.label}>
                <span>{stat.label}</span>
                <strong>
                  {stat.value}
                  <i className={`wh-stat-icon tone-${index}`}>
                    <TrendingUp size={17} />
                  </i>
                </strong>
                <small>{stat.detail}</small>
              </article>
            ))}
          </div>
          <div className="wh-overview-grid">
            <div className="wh-main-column">
              <article className="wh-panel">
                <div className="wh-panel-heading">
                  <h3>
                    {site.status === "published"
                      ? "Website preview"
                      : "Draft website"}
                  </h3>
                  <span className="wh-state">
                    <i />
                    {site.status === "published" ? "Published" : "Draft"}
                  </span>
                </div>
                <PagePreview page={home} className="wh-overview-preview" />
                <div className="wh-panel-actions">
                  <button disabled={busy} onClick={() => props.onEdit(home)}>
                    <Code2 size={13} />
                    Open in Creative Editor
                  </button>
                  <button
                    disabled={!home || busy}
                    onClick={() => props.onEdit(home)}
                  >
                    <Monitor size={13} />
                    Preview website
                  </button>
                  <small>
                    {site.publishedAt
                      ? `Published ${date(site.publishedAt)}`
                      : "Not published yet"}
                  </small>
                </div>
              </article>
              <article className="wh-panel wh-traffic">
                <div className="wh-panel-heading">
                  <h3>Traffic & bookings</h3>
                  <small>Website activity</small>
                </div>
                <div className="wh-data-empty">
                  <TrendingUp size={26} />
                  <strong>No tracking data yet</strong>
                  <p>
                    Traffic and booking charts will appear once analytics is
                    connected.
                  </p>
                </div>
              </article>
            </div>
            <aside className="wh-side-column">
              <article className="wh-panel">
                <h3>Website status</h3>
                <dl>
                  <div>
                    <dt>Domain</dt>
                    <dd>{site.domain || "Not connected"}</dd>
                  </div>
                  <div>
                    <dt>Publishing</dt>
                    <dd>
                      {site.status === "published"
                        ? `Version ${site.publishedVersion || "—"}`
                        : "Draft"}
                    </dd>
                  </div>
                  <div>
                    <dt>Pages</dt>
                    <dd>{pages.length}</dd>
                  </div>
                  <div>
                    <dt>SSL & security</dt>
                    <dd>Not checked</dd>
                  </div>
                </dl>
              </article>
              <article className="wh-panel">
                <h3>Quick actions</h3>
                <button
                  className="wh-wide"
                  onClick={() => props.onSection("pages")}
                >
                  <Files size={14} />
                  Manage pages
                </button>
                <button
                  className="wh-wide"
                  disabled={busy || !canWrite}
                  onClick={create}
                >
                  <Plus size={14} />
                  Create a page
                </button>
                <p className="wh-footnote">
                  Creative changes open in the Editor. Use Publish to review and
                  release the current draft.
                </p>
              </article>
              <article className="wh-panel">
                <h3>Recent activity</h3>
                {pages.length ? (
                  [...pages]
                    .sort(
                      (a, b) =>
                        Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
                    )
                    .slice(0, 5)
                    .map((page) => (
                      <div className="wh-activity" key={page._id}>
                        <span>
                          <FileText size={14} />
                        </span>
                        <div>
                          <strong>Page updated</strong>
                          <small>{page.title}</small>
                        </div>
                        <time>{date(page.updatedAt)}</time>
                      </div>
                    ))
                ) : (
                  <p className="wh-footnote">
                    Your page updates will appear here.
                  </p>
                )}
              </article>
            </aside>
          </div>
        </>
      ) : tab === "pages" ? (
        <>
          <div className="wh-filters">
            <label className="wh-search">
              <Search size={14} />
              <input
                aria-label="Search pages"
                placeholder="Search pages…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Filter page status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            <select
              aria-label="Filter page type"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="all">All page types</option>
              <option value="page">Page</option>
              <option value="landing">Landing</option>
              <option value="legal">Legal</option>
              <option value="blog_index">Blog index</option>
            </select>
            <select
              aria-label="Sort pages"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="updated">Last updated</option>
              <option value="title">Name A–Z</option>
            </select>
            <div className="wh-segment wh-view-toggle">
              <button
                aria-label="Grid view"
                aria-pressed={!list}
                onClick={() => setList(false)}
              >
                <Grid2X2 size={13} />
                <span>Grid</span>
              </button>
              <button
                aria-label="List view"
                aria-pressed={list}
                onClick={() => setList(true)}
              >
                <List size={13} />
                <span>List</span>
              </button>
            </div>
          </div>
          <div className="wh-pages-layout">
            <div>
              <div className={`wh-page-grid ${list ? "is-list" : ""}`}>
                {filtered.map((item) => (
                  <button
                    key={item._id}
                    aria-label={`Select ${item.title}`}
                    className={`wh-page-card ${selected?._id === item._id ? "is-selected" : ""}`}
                    onClick={() => setSelectedId(item._id)}
                  >
                    <PagePreview page={item} />
                    <strong>{item.title}</strong>
                    <small>/{item.slug}</small>
                    <div className="wh-page-card-status">
                      <span className="wh-state">
                        <i />
                        {item.status === "published" ? "Published" : "Draft"}
                      </span>
                      <span>SEO {Math.round(score(item))}</span>
                    </div>
                    <footer>
                      <span>Updated {date(item.updatedAt)}</span>
                      <MoreHorizontal size={16} />
                    </footer>
                  </button>
                ))}
              </div>
              {!filtered.length && (
                <div className="wh-data-empty">
                  <Files size={26} />
                  <strong>
                    {pages.length
                      ? "No matching pages"
                      : "Create your first page"}
                  </strong>
                  <p>
                    {pages.length
                      ? "Try another search or filter."
                      : "Start manually, create with Kora or choose a template."}
                  </p>
                  {canWrite && (
                    <button onClick={create}>
                      <Plus size={14} />
                      Create a page
                    </button>
                  )}
                </div>
              )}
              <p className="wh-results">
                Showing {filtered.length} of {pages.length} pages
              </p>
            </div>
            <aside className="wh-panel wh-page-detail">
              {selected ? (
                <>
                  <div className="wh-panel-heading">
                    <h3>{selected.title}</h3>
                    <span className="wh-state">
                      <i />
                      {selected.status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="wh-footnote">/{selected.slug}</p>
                  <PagePreview page={selected} />
                  <button
                    className="wh-wide"
                    disabled={busy}
                    onClick={() => props.onEdit(selected)}
                  >
                    Open in Creative Editor
                    <ArrowRight size={13} />
                  </button>
                  <div className="wh-detail-buttons">
                    <button
                      disabled={busy || !canWrite}
                      onClick={() => settings()}
                    >
                      <Settings2 size={13} />
                      Page settings
                    </button>
                    <button
                      disabled={busy || !canWrite}
                      onClick={() => settings(true)}
                    >
                      <Copy size={13} />
                      Duplicate
                    </button>
                  </div>
                  <h4>Page details</h4>
                  <dl>
                    <div>
                      <dt>SEO essentials</dt>
                      <dd>{Math.round(score(selected))} / 100</dd>
                    </div>
                    <div>
                      <dt>Search indexing</dt>
                      <dd>{selected.seo?.noindex ? "Disabled" : "Allowed"}</dd>
                    </div>
                    <div>
                      <dt>Page type</dt>
                      <dd>{selected.kind}</dd>
                    </div>
                    <div>
                      <dt>Revision</dt>
                      <dd>{selected.__v}</dd>
                    </div>
                    <div>
                      <dt>Last updated</dt>
                      <dd>{date(selected.updatedAt)}</dd>
                    </div>
                  </dl>
                  <button
                    className="wh-delete"
                    disabled={busy || !canWrite}
                    onClick={remove}
                  >
                    <Trash2 size={13} />
                    Delete draft page
                  </button>
                  <p className="wh-footnote">
                    SEO essentials checks the page title, description and H1. It
                    is not a full SEO audit.
                  </p>
                </>
              ) : (
                <p className="wh-footnote">Select a page to see its details.</p>
              )}
            </aside>
          </div>
        </>
      ) : (
        <div className="wh-pages-layout">
          <article className="wh-panel">
            <div className="wh-panel-heading">
              <div>
                <h3>Main navigation</h3>
                <p className="wh-footnote">
                  Reorder pages and nest up to 2 levels.
                </p>
              </div>
              <button
                disabled={busy || !canWrite || !navDirty || !navigation}
                onClick={() =>
                  run("Saving navigation", async () => {
                    const saved = await koraRequest<WebsiteNavigation>(
                      `websites/${site._id}/navigation`,
                      "PATCH",
                      {
                        expectedVersion: navigation!.version,
                        items: navigation!.items,
                      },
                    );
                    setNavigation(saved);
                    setNavDirty(false);
                    setNotice("Navigation saved.");
                  })
                }
              >
                <Check size={14} />
                Save changes
              </button>
            </div>
            {navigation ? (
              navigation.items.map((item, index) => (
                <div
                  className={`wh-menu-row depth-${item.depth}`}
                  key={item.pageId}
                >
                  <div>
                    <input
                      aria-label={`Menu label for ${pages.find((p) => p._id === item.pageId)?.title || item.label}`}
                      value={item.label}
                      disabled={busy || !canWrite}
                      maxLength={120}
                      onChange={(event) => {
                        setNavigation({
                          ...navigation,
                          items: navigation.items.map((entry, i) =>
                            i === index
                              ? { ...entry, label: event.target.value }
                              : entry,
                          ),
                        });
                        setNavDirty(true);
                      }}
                    />
                    <small>
                      /{pages.find((page) => page._id === item.pageId)?.slug}
                    </small>
                  </div>
                  <label className="wh-checkbox">
                    <input
                      type="checkbox"
                      checked={item.visible}
                      disabled={busy || !canWrite}
                      onChange={(event) => {
                        setNavigation({
                          ...navigation,
                          items: navigation.items.map((entry, i) =>
                            i === index
                              ? { ...entry, visible: event.target.checked }
                              : entry,
                          ),
                        });
                        setNavDirty(true);
                      }}
                    />
                    Visible
                  </label>
                  <select
                    aria-label={`Nesting for ${item.label}`}
                    value={item.depth}
                    disabled={index === 0 || busy || !canWrite}
                    onChange={(event) => {
                      setNavigation({
                        ...navigation,
                        items: navigation.items.map((entry, i) =>
                          i === index
                            ? { ...entry, depth: Number(event.target.value) }
                            : entry,
                        ),
                      });
                      setNavDirty(true);
                    }}
                  >
                    <option value={0}>Main</option>
                    <option value={1}>Nested</option>
                  </select>
                  <button
                    aria-label={`Move ${item.label} up`}
                    disabled={index === 0 || busy || !canWrite}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    aria-label={`Move ${item.label} down`}
                    disabled={
                      index === navigation.items.length - 1 || busy || !canWrite
                    }
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
              ))
            ) : (
              <p className="wh-footnote">Loading navigation…</p>
            )}
          </article>
          <aside className="wh-side-column">
            <article className="wh-panel">
              <h3>Menu preview</h3>
              <div className="wh-menu-preview">
                {navigation?.items
                  .filter((item) => item.visible)
                  .map((item) => (
                    <button
                      key={item.pageId}
                      className={`depth-${item.depth}`}
                      onClick={() =>
                        props.onEdit(
                          pages.find((page) => page._id === item.pageId) ||
                            null,
                        )
                      }
                    >
                      {item.label}
                      <ArrowRight size={12} />
                    </button>
                  ))}
              </div>
              <PagePreview page={home} />
            </article>
            <article className="wh-panel">
              <h3>Navigation rules</h3>
              <dl>
                <div>
                  <dt>Maximum depth</dt>
                  <dd>2 levels</dd>
                </div>
                <div>
                  <dt>Mobile menu</dt>
                  <dd>Same structure</dd>
                </div>
              </dl>
              <p className="wh-footnote">
                Menu structure is saved as draft configuration. Public
                navigation is included in the next published release.
              </p>
            </article>
          </aside>
        </div>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent className="wh-dialog">
          <DialogHeader>
            <DialogTitle>
              {dialog === "choice"
                ? "Create a page"
                : dialog === "settings"
                  ? "Page settings"
                  : dialog === "duplicate"
                    ? "Duplicate page"
                    : dialog === "kora"
                      ? "Create with Kora"
                      : dialog === "template"
                        ? "Use a template"
                        : "Start manually"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "choice"
                ? "Choose how you want to create this page."
                : "Save your changes as a draft. You can continue editing at any time."}
            </DialogDescription>
          </DialogHeader>
          <div className="kw-app wh-dialog-body">
            {dialog === "choice" ? (
              <>
                <div className="wh-choices">
                  {[
                    {
                      mode: "manual" as const,
                      label: "Start manually",
                      eyebrow: "FULL CONTROL",
                      icon: Plus,
                      detail:
                        "Build the page with your own content in the website editor.",
                    },
                    {
                      mode: "kora" as const,
                      label: "Create with Kora",
                      eyebrow: "AI ASSISTED",
                      icon: Sparkles,
                      detail:
                        "Describe the page and let Kora prepare the first draft.",
                    },
                    {
                      mode: "template" as const,
                      label: "Use template",
                      eyebrow: "QUICK START",
                      icon: LayoutTemplate,
                      detail:
                        "Choose a starting layout and adapt it to your brand.",
                    },
                  ].map((choice) => (
                    <button
                      key={choice.mode}
                      onClick={() => setDialog(choice.mode)}
                    >
                      <choice.icon size={25} />
                      <small>{choice.eyebrow}</small>
                      <strong>{choice.label}</strong>
                      <p>{choice.detail}</p>
                      <span>
                        Continue <ArrowRight size={12} />
                      </span>
                    </button>
                  ))}
                </div>
                <p className="wh-footnote">
                  You can use Kora at any time inside the website editor.
                </p>
              </>
            ) : (
              <form onSubmit={submit}>
                {dialog !== "kora" && (
                  <label>
                    Page title
                    <input
                      required
                      maxLength={120}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                )}
                <label>
                  Page slug
                  <input
                    required
                    maxLength={100}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                  />
                </label>
                {dialog === "kora" && (
                  <label>
                    Describe your page
                    <textarea
                      required
                      maxLength={6000}
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="Describe the page, audience and visual style…"
                    />
                  </label>
                )}
                {dialog === "template" && (
                  <label>
                    Starting template
                    <select
                      value={template}
                      onChange={(event) => setTemplate(event.target.value)}
                    >
                      {templates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {dialog === "settings" && (
                  <>
                    <label>
                      SEO title
                      <input
                        maxLength={120}
                        value={seoTitle}
                        onChange={(event) => setSeoTitle(event.target.value)}
                      />
                    </label>
                    <label>
                      SEO description
                      <textarea
                        maxLength={320}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                      />
                    </label>
                    <label className="wh-checkbox">
                      <input
                        type="checkbox"
                        checked={noindex}
                        onChange={(event) => setNoindex(event.target.checked)}
                      />
                      Ask search engines not to index this page
                    </label>
                  </>
                )}
                <div className="wh-dialog-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDialog(null)}
                  >
                    Cancel
                  </button>
                  <button className="kw-primary" disabled={busy || !canWrite}>
                    {busy
                      ? "Working…"
                      : dialog === "settings"
                        ? "Save changes"
                        : dialog === "kora"
                          ? "Generate page"
                          : "Create page"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
