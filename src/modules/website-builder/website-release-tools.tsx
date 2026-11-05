"use client";
import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  History,
  Rocket,
  ShieldCheck,
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
  type Website,
  type WebsitePage,
  type WebsiteReleases,
} from "@/lib/kora/client";

type Props = {
  mode: "publish" | "history" | "releases" | null;
  site: Website;
  page: WebsitePage | null;
  pages: WebsitePage[];
  busy: boolean;
  canWrite: boolean;
  onBusy: (value: string) => void;
  onError: (error: unknown) => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
};
export function WebsiteReleaseTools(props: Props) {
  const [versions, setVersions] = useState<
    { version: number; title: string; note: string; at: string }[]
  >([]);
  const [releases, setReleases] = useState<WebsiteReleases | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("overview");
  useEffect(() => { setMessage(""); }, [props.mode]);
  useEffect(() => {
    if (!props.mode) return;
    let active = true;
    setConfirmed(false);
    setLiveUrl("");
    setTab("overview");
    if (props.mode === "history" && props.page)
      koraRequest<{ versions: typeof versions }>(
        `websites/${props.site._id}/pages/${props.page._id}/versions`,
      )
        .then((result) => {
          if (active) setVersions(result.versions);
        })
        .catch(props.onError);
    else
      koraRequest<WebsiteReleases>(`websites/${props.site._id}/releases`)
        .then((result) => {
          if (active) setReleases(result);
        })
        .catch(props.onError);
    return () => {
      active = false;
    };
    // Page revisions refresh this dialog after a restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, props.site._id, props.page?._id, props.page?.__v]);
  async function run(label: string, work: () => Promise<void>) {
    props.onBusy(label);
    try {
      await work();
      await props.onRefresh();
    } catch (error) {
      props.onError(error);
    } finally {
      props.onBusy("");
    }
  }
  const emptyPages = props.pages.filter((page) => !page.html.trim());
  const missingSeo = props.pages.filter(
    (page) => !page.seo?.title || !page.seo.description,
  );
  async function publish() {
    await run("Publishing website", async () => {
      const result = await koraRequest<{ url: string; version: number }>(
        `websites/${props.site._id}/publish`,
        "POST",
        {
          expectedPages: props.pages.map((page) => ({
            id: page._id,
            version: page.__v,
          })),
          note,
        },
      );
      setLiveUrl(new URL(result.url, window.location.origin).href);
      setMessage(`Version ${result.version} is live.`);
    });
  }
  return (
    <Dialog
      open={!!props.mode}
      onOpenChange={(open) => {
        if (!open && !props.busy) props.onClose();
      }}
    >
      <DialogContent showCloseButton={!props.busy} className="wh-dialog wr-dialog">
        <DialogHeader>
          <DialogTitle>
            {liveUrl
              ? "Your website is live"
              : props.mode === "history"
                ? "Page versions"
                : props.mode === "releases"
                  ? "Publish history"
                  : "Review & publish"}
          </DialogTitle>
          <DialogDescription>
            {props.mode === "history"
              ? "Restore a saved snapshot as a draft. Your current content is backed up before restoring."
              : "Published releases are immutable. Your draft changes stay private until you publish."}
          </DialogDescription>
        </DialogHeader>
        <div className="kw-app wh-dialog-body">
          {message && (
            <p className="wh-saved" role="status">
              <Check size={14} />
              {message}
            </p>
          )}
          {liveUrl ? (
            <div className="wr-success">
              <div className="wr-success-mark">
                <Check size={30} />
              </div>
              <h3>Published successfully</h3>
              <p>Share your website with the world.</p>
              <label>
                Live URL
                <input
                  aria-label="Published website URL"
                  readOnly
                  value={liveUrl}
                />
              </label>
              <div className="wr-actions">
                <a
                  className="wr-link"
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open website <ExternalLink size={13} />
                </a>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(liveUrl);
                      setMessage("Website link copied.");
                    } catch {
                      setMessage("Select and copy the website URL above.");
                    }
                  }}
                >
                  <Copy size={13} />
                  Copy link
                </button>
              </div>
            </div>
          ) : props.mode === "publish" ? (
            <>
              <div className="wh-segment wr-tabs">
                {["overview", "pages", "checks"].map((item) => (
                  <button
                    key={item}
                    aria-pressed={tab === item}
                    onClick={() => setTab(item)}
                  >
                    {item === "overview"
                      ? "Overview"
                      : item === "pages"
                        ? "Pages"
                        : "Final checks"}
                  </button>
                ))}
              </div>
              <div className="wr-counts">
                <div>
                  <strong>{props.pages.length}</strong>
                  <small>Pages included</small>
                </div>
                <div>
                  <strong>
                    {
                      props.pages.filter((page) => page.status === "draft")
                        .length
                    }
                  </strong>
                  <small>Draft pages</small>
                </div>
                <div>
                  <strong>
                    {emptyPages.length || (!props.pages.length ? 1 : 0)}
                  </strong>
                  <small>Blockers</small>
                </div>
              </div>
              {tab === "pages" ? (
                <div className="wr-list">
                  {props.pages.map((page) => (
                    <div key={page._id}>
                      <span>
                        <strong>{page.title}</strong>
                        <small>/{page.slug}</small>
                      </span>
                      <span>{page.status}</span>
                    </div>
                  ))}
                </div>
              ) : tab === "checks" ? (
                <div className="wr-list">
                  <div>
                    <span>Every page has content</span>
                    <span>
                      {emptyPages.length || !props.pages.length
                        ? "Needs attention"
                        : "Passed"}
                    </span>
                  </div>
                  <div>
                    <span>SEO titles and descriptions</span>
                    <span>
                      {missingSeo.length
                        ? `${missingSeo.length} suggestions`
                        : "Complete"}
                    </span>
                  </div>
                  <div>
                    <span>Snapshot backup</span>
                    <span>Created on publish</span>
                  </div>
                  <div>
                    <span>Generated JavaScript</span>
                    <span>Blocked by security policy</span>
                  </div>
                  <p className="wh-footnote">
                    Review tablet and mobile previews before publishing. This
                    checklist does not claim an automated accessibility or
                    performance audit.
                  </p>
                </div>
              ) : (
                <article className="wh-panel">
                  <div className="wh-panel-heading">
                    <h3>Publication</h3>
                    <ShieldCheck size={18} />
                  </div>
                  <dl>
                    <div>
                      <dt>Website</dt>
                      <dd>{props.site.name}</dd>
                    </div>
                    <div>
                      <dt>Destination</dt>
                      <dd>Hosted public link</dd>
                    </div>
                    <div>
                      <dt>Mode</dt>
                      <dd>Publish immediately</dd>
                    </div>
                  </dl>
                </article>
              )}
              <label className="wr-note">
                Release note
                <input
                  maxLength={300}
                  placeholder="What changed in this version?"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <label className="wh-checkbox wr-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                I reviewed these pages and approve publishing them.
              </label>
              <div className="wr-actions">
                <button disabled={props.busy} onClick={props.onClose}>
                  Back to editor
                </button>
                <button
                  className="kw-primary"
                  onClick={publish}
                  disabled={
                    props.busy ||
                    !props.canWrite ||
                    !confirmed ||
                    !props.pages.length ||
                    !!emptyPages.length
                  }
                >
                  <Rocket size={14} />
                  {props.busy ? "Publishing…" : "Publish now"}
                </button>
              </div>
            </>
          ) : props.mode === "history" ? (
            <div className="wr-list">
              <div>
                <span>
                  <strong>Current draft</strong>
                  <small>Revision {props.page?.__v}</small>
                </span>
                <span className="wh-state">Current</span>
              </div>
              {versions.map((version) => (
                <div key={version.version}>
                  <span>
                    <strong>
                      {version.note || `Snapshot ${version.version}`}
                    </strong>
                    <small>{new Date(version.at).toLocaleString()}</small>
                  </span>
                  <button
                    disabled={props.busy || !props.canWrite}
                    onClick={() =>
                      run("Restoring page", async () => {
                        await koraRequest(
                          `websites/${props.site._id}/pages/${props.page!._id}/restore`,
                          "POST",
                          {
                            version: version.version,
                            expectedVersion: props.page!.__v,
                          },
                        );
                        setMessage(
                          "Page restored as a draft. The live website is unchanged.",
                        );
                      })
                    }
                  >
                    <History size={13} />
                    Restore
                  </button>
                </div>
              ))}
              {!versions.length && (
                <p className="wh-footnote">
                  Save an edit to create the first snapshot. The most recent 30
                  snapshots are retained.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="wr-list">
                {releases?.releases.map((release) => (
                  <div key={release.version}>
                    <span>
                      <strong>
                        Version {release.version}
                        {release.version === releases.publishedVersion
                          ? " · Live"
                          : ""}
                      </strong>
                      <small>
                        {release.note} ·{" "}
                        {new Date(release.createdAt).toLocaleString()}
                      </small>
                    </span>
                    {release.version !== releases.publishedVersion && (
                      <button
                        disabled={props.busy || !props.canWrite}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Republish version ${release.version}? Your current draft will stay unchanged.`,
                            )
                          )
                            void run(
                              "Restoring published version",
                              async () => {
                                const result = await koraRequest<{
                                  version: number;
                                }>(
                                  `websites/${props.site._id}/releases/${release.version}/republish`,
                                  "POST",
                                  {
                                    expectedPublishedVersion:
                                      releases.publishedVersion,
                                  },
                                );
                                setMessage(
                                  `Version ${result.version} is now live. Reload history to see the new release.`,
                                );
                                setReleases(await koraRequest<WebsiteReleases>(`websites/${props.site._id}/releases`));
                              },
                            );
                        }}
                      >
                        Republish
                      </button>
                    )}
                  </div>
                ))}
                {!releases?.releases.length && (
                  <p className="wh-footnote">
                    Published versions will appear here.
                  </p>
                )}
              </div>
              {props.site.status === "published" && (
                <button
                  className="wh-delete"
                  disabled={props.busy || !props.canWrite}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Unpublish this website? Visitors will no longer be able to open it.",
                      )
                    )
                      void run("Unpublishing", async () => {
                        await koraRequest(
                          `websites/${props.site._id}/unpublish`,
                          "POST",
                          {},
                        );
                        setMessage(
                          "Website unpublished. Drafts and release history are kept.",
                        );
                      });
                  }}
                >
                  Unpublish website
                </button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
