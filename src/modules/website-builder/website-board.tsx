"use client";
import { useEffect, useState } from "react";
import { Check, MessageSquare, Send, Sparkles } from "lucide-react";
import {
  koraRequest,
  previewDocument,
  type Website,
  type WebsitePage,
  type WebsiteComment,
} from "@/lib/kora/client";

type Props = {
  modelId: string;
  site: Website;
  pages: WebsitePage[];
  canWrite: boolean;
  busy: boolean;
  onEdit: (page: WebsitePage) => void;
  onBusy: (label: string) => void;
  onError: (error: unknown) => void;
};
export function WebsiteBoard(props: Props) {
  const [comments, setComments] = useState<WebsiteComment[]>([]),
    [selected, setSelected] = useState(props.pages[0]?._id || ""),
    [content, setContent] = useState(""),
    [kind, setKind] = useState("comment"),
    [filter, setFilter] = useState("all"),
    [zoom, setZoom] = useState(100);
  const page =
    props.pages.find((item) => item._id === selected) || props.pages[0];
  useEffect(() => {
    let active = true;
    koraRequest<WebsiteComment[]>(`websites/${props.site._id}/comments`)
      .then((data) => {
        if (active) setComments(data);
      })
      .catch(props.onError);
    return () => {
      active = false;
    };
  }, [props.site._id, props.onError]);
  async function run(label: string, work: () => Promise<void>) {
    props.onBusy(label);
    try {
      await work();
    } catch (error) {
      props.onError(error);
    } finally {
      props.onBusy("");
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!page) return;
    await run("Saving comment", async () => {
      const comment = await koraRequest<WebsiteComment>(
        `websites/${props.site._id}/comments`,
        "POST",
        { pageId: page._id, content, kind },
      );
      setComments((current) => [comment, ...current]);
      setContent("");
    });
  }
  const filtered = comments.filter(
    (comment) =>
      filter === "all" ||
      (filter === "open" ? !comment.resolved : comment.resolved),
  );
  return (
    <div className="wb-board">
      <section className="wb-workspace">
        <div className="wh-heading">
          <div>
            <p className="kw-eyebrow">REVIEW BOARD</p>
            <h2>{props.site.name}</h2>
            <p>
              Review pages, leave notes and collect feedback before publishing.
            </p>
          </div>
          <label className="wb-zoom">
            Zoom
            <input
              aria-label="Board zoom"
              type="range"
              min={60}
              max={120}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <small>{zoom}%</small>
          </label>
        </div>
        <div className="wb-scroll">
          <div className="wb-cards" style={{ zoom: zoom / 100 }}>
            {props.pages.map((item, index) => (
              <article
                key={item._id}
                className={`wb-card ${page?._id === item._id ? "is-selected" : ""}`}
              >
                <button onClick={() => setSelected(item._id)}>
                  <span>
                    {String(index + 1).padStart(2, "0")} / {item.title}
                  </span>
                  <div className="wh-thumbnail">
                    <iframe
                      title={`${item.title} board thumbnail`}
                      tabIndex={-1}
                      aria-hidden="true"
                      sandbox=""
                      srcDoc={previewDocument(item.html, item.css)}
                    />
                  </div>
                  <small>
                    {
                      comments.filter(
                        (comment) =>
                          comment.page_id === item._id && !comment.resolved,
                      ).length
                    }{" "}
                    open comments
                  </small>
                </button>
                <button className="wb-open" onClick={() => props.onEdit(item)}>
                  Open in editor
                </button>
                {comments
                  .filter(
                    (comment) =>
                      comment.page_id === item._id &&
                      comment.kind === "note" &&
                      !comment.resolved,
                  )
                  .map((note) => (
                    <div className="wb-note" key={note._id}>
                      {note.content}
                    </div>
                  ))}
              </article>
            ))}
          </div>
        </div>
        {!props.pages.length && (
          <div className="wh-data-empty">
            <MessageSquare size={25} />
            <strong>Create pages to start your review board.</strong>
          </div>
        )}
      </section>
      <aside className="wb-comments">
        <header>
          <strong>Comments</strong>
          <small>{comments.length} total</small>
        </header>
        <div className="wh-segment">
          {["all", "open", "resolved"].map((value) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="wb-comment-list">
          {filtered.map((comment) => (
            <article key={comment._id}>
              <div>
                <span className="wb-avatar">
                  {comment.authorName?.slice(0, 1) || "K"}
                </span>
                <span>
                  <strong>{comment.authorName || "Team member"}</strong>
                  <small>
                    {props.pages.find((item) => item._id === comment.page_id)
                      ?.title || "Removed page"}
                  </small>
                </span>
              </div>
              <p>{comment.content}</p>
              <button
                disabled={props.busy || !props.canWrite}
                onClick={() =>
                  run("Updating comment", async () => {
                    const updated = await koraRequest<WebsiteComment>(
                      `websites/${props.site._id}/comments/${comment._id}`,
                      "PATCH",
                      { resolved: !comment.resolved },
                    );
                    setComments((items) =>
                      items.map((item) =>
                        item._id === updated._id ? updated : item,
                      ),
                    );
                  })
                }
              >
                <Check size={11} />
                {comment.resolved ? "Reopen" : "Resolve"}
              </button>
            </article>
          ))}
          {!filtered.length && (
            <p className="wh-footnote">
              No {filter === "all" ? "" : filter} comments yet.
            </p>
          )}
        </div>
        <form onSubmit={submit}>
          <label>
            Page
            <select
              value={page?._id || ""}
              onChange={(event) => setSelected(event.target.value)}
            >
              {props.pages.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Feedback type
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="comment">Comment</option>
              <option value="note">Board note</option>
            </select>
          </label>
          <label>
            Review comment
            <textarea
              required
              maxLength={3000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <button
            className="kw-primary"
            disabled={props.busy || !props.canWrite || !page}
          >
            <Send size={12} />
            Add comment
          </button>
          <button
            type="button"
            disabled={props.busy || !props.canWrite || !page}
            onClick={() =>
              run("Kora is reviewing this page", async () => {
                await koraRequest(
                  `websites/${props.site._id}/proposals`,
                  "POST",
                  {
                    pageId: page._id,
                  modelId: props.modelId || undefined,
                    expectedVersion: page.__v,
                    prompt:
                      "Review this page for visual hierarchy, clear copy and responsive layout. Prepare a polished improvement proposal while preserving the business facts.",
                  },
                );
                props.onEdit(page);
              })
            }
          >
            <Sparkles size={12} />
            Ask Kora to review page
          </button>
        </form>
      </aside>
    </div>
  );
}
