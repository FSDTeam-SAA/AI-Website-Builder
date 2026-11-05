"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Code2,
  Globe,
  Loader2,
  LogOut,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  History,
  Rocket,
  ExternalLink,
  Maximize2,
  ImagePlus,
  Palette,
  Undo2,
  Redo2,
  Download,
  Smartphone,
  Sparkles,
  Tablet,
} from "lucide-react";
import {
  koraRequest,
  KoraApiError,
  type BuilderContext,
  type Website,
  type WebsitePage,
  type WebsiteAIModels,
} from "@/lib/kora/client";
import { WebsiteSidebar, type WebsiteSection } from "./website-sidebar";
import { WebsiteHub } from "./website-hub";
import { WebsiteCanvas } from "./website-canvas";
import { WebsiteAssistant } from "./website-assistant";
import { WebsiteReleaseTools } from "./website-release-tools";
import { WebsiteMedia, WebsiteSettings } from "./website-media-settings";
import { WebsiteBoard } from "./website-board";
import { WebsiteBrand } from "./website-brand";

export function WebsiteBuilder() {
  const [context, setContext] = useState<BuilderContext | null>(null);
  const [sites, setSites] = useState<Website[]>([]);
  const [site, setSite] = useState<Website | null>(null);
  const [aiModels, setAiModels] = useState<WebsiteAIModels | null>(null);
  const [modelId, setModelId] = useState("");
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [page, setPage] = useState<WebsitePage | null>(null);
  const [html, setHtml] = useState("");
  const [css, setCss] = useState("");
  const [siteName, setSiteName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("Connecting to Kora");
  const [view, setView] = useState<"canvas" | "code">("canvas");
  const [device, setDevice] = useState(0);
  const [showAllWebsites, setShowAllWebsites] = useState(true);
  const [showPages, setShowPages] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [undo, setUndo] = useState<{ html: string; css: string }[]>([]);
  const [redo, setRedo] = useState<{ html: string; css: string }[]>([]);
  const [releaseTool, setReleaseTool] = useState<
    "publish" | "history" | "releases" | null
  >(null);
  const dirty = !!page && (html !== page.html || css !== page.css);
  const canWrite = !!context?.capabilities.write;

  const fail = useCallback((cause: unknown) => {
    setError(
      cause instanceof Error
        ? cause.message
        : "Something went wrong. Please retry.",
    );
    if (cause instanceof KoraApiError && cause.status === 401) {
      setContext(null);
      setSites([]);
      setSite(null);
      setPages([]);
      setPage(null);
      setHtml("");
      setCss("");
    }
  }, []);
  const boot = useCallback(async () => {
    setBusy("Connecting to Kora");
    setError("");
    try {
      const ctx = await koraRequest<BuilderContext>("context");
      setContext(ctx);
      setSites(await koraRequest<Website[]>("websites?limit=100"));
      const models = await koraRequest<WebsiteAIModels>("models");
      setAiModels(models);
      setModelId((current) => current || models.defaultId);
    } catch (cause) {
      fail(cause);
      if (cause instanceof KoraApiError && cause.status === 401) setError("");
    } finally {
      setBusy("");
    }
  }, [fail]);
  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function changeSource(nextHtml: string, nextCss: string) {
    setUndo((current) => [...current, { html, css }].slice(-30));
    setRedo([]);
    setHtml(nextHtml);
    setCss(nextCss);
  }
  function undoSource() {
    const previous = undo.at(-1);
    if (!previous) return;
    setRedo((current) => [...current, { html, css }]);
    setUndo((current) => current.slice(0, -1));
    setHtml(previous.html);
    setCss(previous.css);
  }
  function redoSource() {
    const next = redo.at(-1);
    if (!next) return;
    setUndo((current) => [...current, { html, css }]);
    setRedo((current) => current.slice(0, -1));
    setHtml(next.html);
    setCss(next.css);
  }
  async function downloadWebsite() {
    if (!site || dirty) return;
    setBusy("Exporting website");
    try {
      const { default: JSZip } = await import("jszip");
      const { previewDocument } = await import("@/lib/kora/client");
      const zip = new JSZip();
      const records = await koraRequest<WebsitePage[]>(
        `websites/${site._id}/pages`,
      );
      const menu = await koraRequest<{
        items: { pageId: string; label: string; visible: boolean }[];
      }>(`websites/${site._id}/navigation`);
      const escape = (value: string) =>
        value.replace(
          /[&<>"']/g,
          (char) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[char]!,
        );
      for (const record of records) {
        const nav = menu.items
          .filter((item) => item.visible)
          .map((item) => {
            const target = records.find((p) => p._id === item.pageId);
            return target
              ? `<a href="./${target.slug}.html">${escape(item.label)}</a>`
              : "";
          })
          .join(" ");
        let content = previewDocument(record.html, record.css)
          .replace(
            "</head>",
            `<title>${escape(record.seo?.title || record.title)}</title><meta name="description" content="${escape(record.seo?.description || "")}"></head>`,
          )
          .replace(
            "<body>",
            `<body><nav aria-label="Website navigation">${nav}</nav>`,
          )
          .replace(
            /href="\/?([a-z0-9-]+)\/?"/gi,
            (_all, slug) => `href="./${slug}.html"`,
          );
        if (record.seo?.noindex)
          content = content.replace(
            "</head>",
            '<meta name="robots" content="noindex,nofollow"></head>',
          );
        zip.file(`${record.slug}.html`, content);
        if (
          record.slug === "home" ||
          (!records.some((p) => p.slug === "home") &&
            record._id === records[0]._id)
        )
          zip.file("index.html", content);
      }
      zip.file(
        "README.txt",
        "Static website draft export from KoraAI. Open index.html. Remote images require an internet connection. Live booking, payment and chatbot services are not included in this static archive.",
      );
      const blob = await zip.generateAsync({ type: "blob" }),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `${site.name.replace(/[^a-z0-9-]/gi, "-").slice(0, 60) || "website"}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }
  function selectPage(next: WebsitePage | null) {
    setUndo([]);
    setRedo([]);
    setPage(next);
    setHtml(next?.html || "");
    setCss(next?.css || "");
    setNotice("");
  }
  function mayLeave() {
    return (
      !dirty || window.confirm("Discard the unsaved changes to this page?")
    );
  }
  async function openSite(
    next: Website,
    mode: "overview" | "editor" = "overview",
  ) {
    if (!mayLeave()) return;
    setBusy("Opening website");
    setError("");
    try {
      const nextPages = await koraRequest<WebsitePage[]>(
        `websites/${next._id}/pages`,
      );
      setSite(next);
      setShowAllWebsites(false);
      setShowBoard(false);
      setShowPages(false);
      setShowOverview(mode === "overview");
      setPages(nextPages);
      selectPage(nextPages[0] || null);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy("");
    }
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy("Signing in");
    setError("");
    try {
      const ctx = await koraRequest<BuilderContext>("session", "POST", {
        email,
        password,
        mfaCode,
      });
      setPassword("");
      setMfaCode("");
      setContext(ctx);
      setSites(await koraRequest<Website[]>("websites?limit=100"));
      const models = await koraRequest<WebsiteAIModels>("models");
      setAiModels(models);
      setModelId((current) => current || models.defaultId);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy("");
    }
  }
  async function createSite(event: React.FormEvent) {
    event.preventDefault();
    setBusy("Creating website");
    setError("");
    try {
      const created = await koraRequest<Website>("websites", "POST", {
        name: siteName,
      });
      setSites((current) => [created, ...current]);
      setSite(created);
      setShowAllWebsites(false);
      setShowOverview(false);
      setShowPages(false);
      setPages([]);
      selectPage(null);
      setSiteName("");
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy("");
    }
  }
  async function createPage(
    generate: boolean,
    newPrompt = "",
    newSlug = "home",
  ) {
    if (!site || !mayLeave()) return;
    setBusy(generate ? "Kora is creating your page" : "Creating blank page");
    setError("");
    setNotice("");
    try {
      const created = await koraRequest<WebsitePage>(
        `websites/${site._id}/${generate ? "generate" : "pages"}`,
        "POST",
        generate
          ? { prompt: newPrompt, slug: newSlug, modelId: modelId || undefined }
          : {
              title: newSlug === "home" ? "Home" : "New page",
              slug: newSlug,
              html: "<main><h1>Your new page</h1><p>Open Code to edit this page, or generate another page with Kora.</p></main>",
              css: "body{font-family:system-ui;background:#fafafa;color:#18202c}main{max-width:960px;margin:auto;padding:64px 32px}",
            },
      );
      setPages((current) => [...current, created]);
      selectPage(created);
      setNotice(generate ? "Draft generated and saved." : "Blank page saved.");
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy("");
    }
  }
  async function save() {
    if (!site || !page) return;
    setBusy("Saving page");
    setError("");
    setNotice("");
    try {
      const saved = await koraRequest<WebsitePage>(
        `websites/${site._id}/pages/${page._id}`,
        "PATCH",
        { html, css, expectedVersion: page.__v },
      );
      setPages((current) =>
        current.map((item) => (item._id === saved._id ? saved : item)),
      );
      // Saving updates the persisted baseline without discarding the local edit history.
      setPage(saved);
      setHtml(saved.html);
      setCss(saved.css);
      setNotice("Changes saved.");
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy("");
    }
  }
  async function signOut() {
    if (!mayLeave()) return;
    setBusy("Signing out");
    setError("");
    try {
      await koraRequest("session", "DELETE");
      setContext(null);
      setSites([]);
      setSite(null);
      setPages([]);
      selectPage(null);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy("");
    }
  }

  function navigate(section: WebsiteSection) {
    if (busy) return;
    if (section === "settings") {
      if (dirty) {
        setError("Save your changes before opening website settings.");
        return;
      }
      setSettingsOpen(true);
      return;
    }
    if (section === "publish") {
      if (dirty) {
        setError("Save your changes before publishing.");
        return;
      }
      setReleaseTool("publish");
      return;
    }
    if (!mayLeave()) return;
    setShowAllWebsites(section === "websites");
    setShowBoard(section === "board");
    if (section === "board") {
      setShowPages(false);
      setShowOverview(false);
      return;
    }
    if (section === "websites") {
      selectPage(page);
      setShowPages(false);
      setShowOverview(false);
      return;
    }
    if (section === "overview") {
      setShowOverview(true);
      setShowPages(false);
      return;
    }
    if (section === "pages") {
      setShowPages(true);
      setShowOverview(false);
      return;
    }
    setShowPages(false);
    setShowOverview(false);
    setView(section === "code" ? "code" : "canvas");
  }

  function editorShortcut(action: "save" | "undo" | "redo") {
    if (busy || !canWrite) return;
    if (action === "save") {
      if (dirty) void save();
    } else if (action === "undo") undoSource();
    else redoSource();
  }

  // Text fields keep their native undo history; page shortcuts apply elsewhere.
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        !site ||
        showAllWebsites ||
        showOverview ||
        showPages ||
        showBoard ||
        settingsOpen ||
        mediaOpen ||
        releaseTool
      )
        return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!busy && dirty && canWrite) void save();
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]"))
        return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (!busy && canWrite) {
          if (event.shiftKey) redoSource();
          else undoSource();
        }
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });

  async function refreshWebsite() {
    if (!site) return;
    const updated = await koraRequest<Website>(`websites/${site._id}`);
    const nextPages = await koraRequest<WebsitePage[]>(
      `websites/${site._id}/pages`,
    );
    setSite(updated);
    setSites((current) =>
      current.map((item) => (item._id === updated._id ? updated : item)),
    );
    setPages(nextPages);
    selectPage(
      nextPages.find((item) => item._id === page?._id) || nextPages[0] || null,
    );
  }

  return (
    <main className="kw-app">
      {context ? (
        <WebsiteSidebar
          organization={context.organization.name}
          sites={sites}
          site={site}
          active={
            settingsOpen
              ? "settings"
              : releaseTool === "publish"
                ? "publish"
                : !site || showAllWebsites
                  ? "websites"
                  : showOverview
                    ? "overview"
                    : showBoard
                      ? "board"
                      : showPages
                        ? "pages"
                        : view === "code"
                          ? "code"
                          : "editor"
          }
          busy={!!busy}
          onNavigate={navigate}
          onSelectSite={openSite}
        />
      ) : (
        <aside className="kw-rail" aria-label="Website tools">
          <WebsiteBrand compact />
          <Globe aria-label="Website builder" />
          <span />
          <Link
            href="/"
            title="Existing app builder"
            aria-label="Existing app builder"
          >
            <ArrowLeft size={18} />
          </Link>
        </aside>
      )}
      <section className={`kw-workspace ${context ? "has-sidebar" : ""}`}>
        <header className="kw-header">
          <div>
            <p className="kw-eyebrow">NOVYA / WEBSITE</p>
            <h1>
              {!showAllWebsites && site && (showOverview || showPages)
                ? "Website"
                : (!showAllWebsites && site?.name) || "Website Builder"}
            </h1>
          </div>
          <span className="kw-status">
            {busy ? (
              <Loader2 className="kw-spin" size={12} />
            ) : (
              <Check size={12} />
            )}{" "}
            {busy || (dirty ? "Unsaved changes" : site ? "Draft" : "Ready")}
          </span>
          <div className="kw-header-actions">
            {site && !showAllWebsites && (
              <div className="wh-segment kw-mode-switch">
                <button
                  aria-pressed={!showBoard}
                  disabled={!!busy}
                  onClick={() => navigate("editor")}
                >
                  Editor
                </button>
                <button
                  aria-pressed={showBoard}
                  disabled={!!busy}
                  onClick={() => navigate("board")}
                >
                  Board
                </button>
              </div>
            )}
            {site && !showAllWebsites && (
              <>
                <button
                  aria-label="Publish history"
                  disabled={!!busy}
                  onClick={() => setReleaseTool("releases")}
                >
                  <History size={14} />
                  <span className="kw-action-label">Releases</span>
                </button>
                {site.status === "published" && site.publicSlug && (
                  <a
                    className="kw-public-link"
                    href={`/site/${site.publicSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open live website"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                <button
                  className="kw-primary"
                  disabled={!!busy || !canWrite || dirty || !pages.length}
                  onClick={() => setReleaseTool("publish")}
                >
                  <Rocket size={14} />
                  <span className="kw-action-label">Publish</span>
                </button>
              </>
            )}
            {context && (
              <>
                <span className="kw-account">{context.actor.name}</span>
                <button
                  onClick={signOut}
                  disabled={!!busy}
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </>
            )}
          </div>
        </header>
        {error && (
          <div className="kw-error" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              Dismiss
            </button>
          </div>
        )}
        {notice && (
          <div className="kw-notice" role="status">
            {notice}
          </div>
        )}
        {!context ? (
          <section className="kw-login">
            <div className="kw-orb">
              <Sparkles size={30} />
            </div>
            <p className="kw-eyebrow">YOUR BUSINESS, ONLINE</p>
            <h2>Build your next chapter.</h2>
            <p>
              Sign in with your Kora business account to create and manage your
              website.
            </p>
            <form onSubmit={signIn}>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                Authenticator code <small>(if enabled)</small>
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                />
              </label>
              <button className="kw-primary" disabled={!!busy}>
                {busy || "Sign in to Kora"}
              </button>
            </form>
            <button className="kw-text-button" disabled={!!busy} onClick={boot}>
              Retry connection
            </button>
          </section>
        ) : !site || showAllWebsites ? (
          <section className="kw-hub">
            <div className="kw-heading">
              <div>
                <p className="kw-eyebrow">{context.organization.name}</p>
                <h2>Your websites</h2>
                <p>Create something that feels like your business.</p>
              </div>
              <button
                onClick={boot}
                disabled={!!busy}
                aria-label="Refresh websites"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            {canWrite && (
              <form className="kw-create" onSubmit={createSite}>
                <input
                  aria-label="Website name"
                  placeholder="Name your website"
                  required
                  maxLength={120}
                  value={siteName}
                  onChange={(event) => setSiteName(event.target.value)}
                />
                <button className="kw-primary" disabled={!!busy}>
                  <Plus size={15} />
                  Create website
                </button>
              </form>
            )}
            <div className="kw-sites">
              {sites.map((item) => (
                <button
                  className="kw-site-card"
                  key={item._id}
                  disabled={!!busy}
                  onClick={() => openSite(item)}
                >
                  <Globe size={25} />
                  <strong>{item.name}</strong>
                  <span>{item.status}</span>
                  <small>Open website →</small>
                </button>
              ))}
            </div>
            {!sites.length && (
              <p className="kw-empty">
                {busy || "Your first website starts here."}
              </p>
            )}
          </section>
        ) : showBoard ? (
          <WebsiteBoard
            modelId={modelId}
            site={site}
            pages={pages}
            canWrite={canWrite}
            busy={!!busy}
            onBusy={setBusy}
            onError={fail}
            onEdit={(next) => {
              selectPage(next);
              setShowBoard(false);
              setShowPages(false);
              setShowOverview(false);
              setView("canvas");
            }}
          />
        ) : showPages || showOverview ? (
          <WebsiteHub
            modelId={modelId}
            key={site._id}
            site={site}
            pages={pages}
            section={showPages ? "pages" : "overview"}
            canWrite={canWrite}
            busy={!!busy}
            onSection={(section) => {
              setShowPages(section === "pages");
              setShowOverview(section === "overview");
            }}
            onEdit={(next) => {
              selectPage(next);
              setShowPages(false);
              setShowOverview(false);
              setView("canvas");
            }}
            onPages={(next) => {
              setPages(next);
              selectPage(
                next.find((item) => item._id === page?._id) || next[0] || null,
              );
            }}
            onBusy={setBusy}
            onError={fail}
          />
        ) : (
          <>
            <div className="kw-toolbar">
              <button
                disabled={!!busy}
                onClick={() => {
                  if (mayLeave()) {
                    setShowAllWebsites(true);
                    selectPage(page);
                  }
                }}
              >
                <ArrowLeft size={14} />
                Websites
              </button>
              <select
                aria-label="Current page"
                disabled={!!busy || !pages.length}
                value={page?._id || ""}
                onChange={(event) => {
                  if (mayLeave())
                    selectPage(
                      pages.find((item) => item._id === event.target.value) ||
                        null,
                    );
                }}
              >
                {!pages.length && <option value="">No pages yet</option>}
                {pages.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <div className="kw-tabs">
                {(["canvas", "code"] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={view === mode}
                    onClick={() => setView(mode)}
                  >
                    {mode === "canvas" ? (
                      <Monitor size={14} />
                    ) : (
                      <Code2 size={14} />
                    )}{" "}
                    {mode === "canvas" ? "Canvas" : "Code"}
                  </button>
                ))}
              </div>
              <div className="kw-devices">
                {[Monitor, Tablet, Smartphone].map((Icon, index) => (
                  <button
                    key={index}
                    aria-label={
                      ["Desktop preview", "Tablet preview", "Mobile preview"][
                        index
                      ]
                    }
                    aria-pressed={device === index}
                    onClick={() => setDevice(index)}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              <button
                aria-label="Undo manual edit"
                title="Undo manual edit (Ctrl/Cmd Z)"
                disabled={!!busy || !undo.length}
                onClick={undoSource}
              >
                <Undo2 size={14} />
              </button>
              <button
                aria-label="Redo manual edit"
                title="Redo manual edit (Ctrl/Cmd Shift Z)"
                disabled={!!busy || !redo.length}
                onClick={redoSource}
              >
                <Redo2 size={14} />
              </button>
              <button
                aria-label="Download website ZIP"
                title="Download website ZIP"
                disabled={!!busy || dirty || !pages.length}
                onClick={downloadWebsite}
              >
                <Download size={14} />
              </button>
              <button
                aria-label="Page version history"
                title="Page version history"
                disabled={!!busy || !page || dirty}
                onClick={() => setReleaseTool("history")}
              >
                <History size={14} />
              </button>
              <button
                aria-label="Website media"
                title="Website media"
                disabled={!!busy || !page || !canWrite}
                onClick={() => setMediaOpen(true)}
              >
                <ImagePlus size={14} />
              </button>
              <button
                aria-label="Website brand"
                title="Website brand and appearance"
                disabled={!!busy || dirty}
                onClick={() => setSettingsOpen(true)}
              >
                <Palette size={14} />
              </button>
              <button
                aria-label="Fullscreen preview"
                title="Fullscreen preview"
                disabled={!page}
                onClick={() => {
                  document
                    .querySelector(".kw-canvas")
                    ?.requestFullscreen()
                    .catch(fail);
                }}
              >
                <Maximize2 size={14} />
              </button>
              <button
                className="kw-primary"
                disabled={!!busy || !dirty || !canWrite}
                title="Save page (Ctrl/Cmd S)"
                onClick={save}
              >
                <Save size={14} />
                Save
              </button>
              <button
                disabled={!!busy}
                onClick={() => openSite(site, "editor")}
                title="Reload saved page"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="kw-editor">
              <section className="kw-canvas" aria-label="Page workspace">
                {busy && (
                  <div className="kw-working">
                    <Loader2 className="kw-spin" size={16} />
                    {busy}
                  </div>
                )}
                {page ? (
                  view === "canvas" ? (
                    <WebsiteCanvas
                      onShortcut={editorShortcut}
                      key={page._id}
                      html={html}
                      css={css}
                      title={page.title}
                      device={device}
                      editable={canWrite && !busy}
                      onChange={changeSource}
                      onRoute={(slug) => {
                        const next = pages.find((item) => item.slug === slug);
                        if (next && mayLeave()) selectPage(next);
                      }}
                    />
                  ) : (
                    <div className="kw-code">
                      <label>
                        HTML
                        <textarea
                          spellCheck={false}
                          value={html}
                          disabled={!!busy || !canWrite}
                          onChange={(event) =>
                            changeSource(event.target.value, css)
                          }
                        />
                      </label>
                      <label>
                        CSS
                        <textarea
                          spellCheck={false}
                          value={css}
                          disabled={!!busy || !canWrite}
                          onChange={(event) =>
                            changeSource(html, event.target.value)
                          }
                        />
                      </label>
                    </div>
                  )
                ) : (
                  <div className="kw-welcome">
                    <div className="kw-orb">
                      <Sparkles size={32} />
                    </div>
                    <h2>What are we creating today?</h2>
                    <p>
                      Describe your website to Kora, or start with a blank page.
                    </p>
                  </div>
                )}
              </section>
              <WebsiteAssistant
                models={aiModels}
                modelId={modelId}
                onModel={setModelId}
                site={site}
                page={page}
                busy={!!busy}
                dirty={dirty}
                canWrite={canWrite}
                organization={context.organization.name}
                onBusy={setBusy}
                onError={fail}
                onPage={(updated) => {
                  setPages((current) =>
                    current.map((item) =>
                      item._id === updated._id ? updated : item,
                    ),
                  );
                  selectPage(updated);
                }}
                onGenerate={(prompt, slug) => createPage(true, prompt, slug)}
                onBlank={(slug) => createPage(false, "", slug)}
              />
            </div>
          </>
        )}
        {site && (
          <WebsiteReleaseTools
            mode={releaseTool}
            site={site}
            page={page}
            pages={pages}
            busy={!!busy}
            canWrite={canWrite}
            onBusy={setBusy}
            onError={fail}
            onClose={() => setReleaseTool(null)}
            onRefresh={refreshWebsite}
          />
        )}
        {site && (
          <>
            <WebsiteMedia
              open={mediaOpen}
              site={site}
              busy={!!busy}
              canWrite={canWrite}
              onBusy={setBusy}
              onError={fail}
              onClose={() => setMediaOpen(false)}
              onInsert={(url, alt) => {
                const doc = new DOMParser().parseFromString(html, "text/html");
                const img = doc.createElement("img");
                img.src = url;
                img.alt = alt;
                img.className = "kora-inserted-image";
                doc.body.appendChild(img);
                changeSource(
                  doc.body.innerHTML,
                  css +
                    "\n.kora-inserted-image{display:block;max-width:100%;height:auto;margin:24px auto}",
                );
              }}
            />
            <WebsiteSettings
              open={settingsOpen}
              site={site}
              busy={!!busy}
              canWrite={canWrite}
              onBusy={setBusy}
              onError={fail}
              onClose={() => setSettingsOpen(false)}
              canApplyTheme={
                !!page && !showOverview && !showPages && !showBoard
              }
              onTheme={(style) => changeSource(html, css + style)}
              onRefresh={refreshWebsite}
            />
          </>
        )}
      </section>
    </main>
  );
}
