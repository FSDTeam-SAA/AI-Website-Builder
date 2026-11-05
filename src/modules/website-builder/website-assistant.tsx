"use client";
import { useEffect, useState } from "react";
import { Check, Plus, Send, Sparkles } from "lucide-react";
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
  type WebsiteProposal,
  type WebsiteMessage,
  type WebsiteAIModels,
} from "@/lib/kora/client";

type Props = {
  models: WebsiteAIModels | null;
  modelId: string;
  onModel: (id: string) => void;
  site: Website;
  page: WebsitePage | null;
  busy: boolean;
  dirty: boolean;
  canWrite: boolean;
  organization: string;
  onBusy: (label: string) => void;
  onError: (error: unknown) => void;
  onPage: (page: WebsitePage) => void;
  onGenerate: (prompt: string, slug: string) => Promise<void>;
  onBlank: (slug: string) => Promise<void>;
};
export function WebsiteAssistant(props: Props) {
  const currentPageId = props.page?._id;
  const [mode, setMode] = useState<"edit" | "new">(props.page ? "edit" : "new");
  const [prompt, setPrompt] = useState("");
  const [slug, setSlug] = useState(props.page ? "new-page" : "home");
  const [messages, setMessages] = useState<WebsiteMessage[]>([]);
  const [review, setReview] = useState<WebsiteProposal | null>(null);
  async function reload() {
    setMessages(
      await koraRequest<WebsiteMessage[]>(
        `websites/${props.site._id}/messages`,
      ),
    );
  }
  useEffect(() => {
    let active = true;
    koraRequest<WebsiteMessage[]>(`websites/${props.site._id}/messages`)
      .then((result) => {
        if (active) setMessages(result);
      })
      .catch(props.onError);
    setMode(currentPageId ? "edit" : "new");
    return () => {
      active = false;
    };
  }, [props.site._id, currentPageId, props.onError]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "new" || !props.page) {
      await props.onGenerate(prompt, slug);
      setPrompt("");
      return;
    }
    if (props.dirty) {
      props.onError(
        new Error(
          "Save your manual changes before asking Kora to edit this page.",
        ),
      );
      return;
    }
    props.onBusy("Kora is preparing your changes");
    try {
      await koraRequest(`websites/${props.site._id}/proposals`, "POST", {
        pageId: props.page._id,
        expectedVersion: props.page.__v,
        modelId: props.modelId || undefined,
        prompt,
      });
      setPrompt("");
      await reload();
    } catch (error) {
      props.onError(error);
    } finally {
      props.onBusy("");
    }
  }
  async function action(id: string, operation: "apply" | "discard") {
    if (props.dirty) {
      props.onError(
        new Error(
          "Save or discard your manual changes before reviewing a Kora edit.",
        ),
      );
      return;
    }
    props.onBusy(
      operation === "apply" ? "Applying changes" : "Discarding changes",
    );
    try {
      const result = await koraRequest<{ page: WebsitePage | null }>(
        `websites/${props.site._id}/proposals/${id}/${operation}`,
        "POST",
        {},
      );
      if (result.page) props.onPage(result.page);
      setReview(null);
      await reload();
    } catch (error) {
      props.onError(error);
    } finally {
      props.onBusy("");
    }
  }
  async function openReview(id: string) {
    try {
      setReview(
        await koraRequest<WebsiteProposal>(
          `websites/${props.site._id}/proposals/${id}`,
        ),
      );
    } catch (error) {
      props.onError(error);
    }
  }
  return (
    <aside className="kw-assistant">
      <header>
        <div className="kw-orb kw-orb-small">
          <Sparkles size={16} />
        </div>
        <div>
          <strong>Kora</strong>
          <small>{props.page?.title || props.organization}</small>
        </div>
        <span className="kw-pill">
          {props.page ? "Page context" : "Website"}
        </span>
      </header>
      <div className="kw-assistant-content wa-messages">
        <div className="kw-message">
          <p>
            {props.page
              ? "What would you like to change?"
              : "Let’s bring your business online."}
          </p>
          <small>
            {props.page
              ? "Ask me to refine the copy, layout or styling. Review each proposal before applying it."
              : "Describe a page and the visual style you want. I’ll create your first draft."}
          </small>
        </div>
        {messages
          .filter(
            (message) => !props.page || message.page_id === props.page._id,
          )
          .map((message) => (
            <div key={message._id} className={`wa-message ${message.role}`}>
              <span>{message.role === "user" ? "You" : "Kora"}</span>
              <p>{message.content}</p>
              {message.proposal_id && (
                <div className="wa-proposal">
                  <strong>
                    {message.proposal_id.summary.length} changes{" "}
                    {message.proposal_id.status === "proposed"
                      ? "ready"
                      : message.proposal_id.status}
                  </strong>
                  {message.proposal_id.summary.map((summary, index) => (
                    <small key={index}>
                      <Check size={10} />
                      {summary}
                    </small>
                  ))}
                  {message.proposal_id.status === "proposed" && (
                    <div>
                      <button
                        disabled={props.busy || !props.canWrite}
                        onClick={() =>
                          action(message.proposal_id!._id, "apply")
                        }
                      >
                        Apply changes
                      </button>
                      <button
                        disabled={props.busy}
                        onClick={() => openReview(message.proposal_id!._id)}
                      >
                        Review
                      </button>
                      <button
                        disabled={props.busy || !props.canWrite}
                        onClick={() =>
                          action(message.proposal_id!._id, "discard")
                        }
                      >
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        {props.busy && (
          <div className="wa-working">
            <span />
            {props.busy}
          </div>
        )}
      </div>
      <form className="kw-composer" onSubmit={submit}>
        <label>
          AI model
          <select aria-label="AI model" value={props.modelId} onChange={event => props.onModel(event.target.value)} disabled={props.busy || !props.models}>
            {props.models?.models.map(model => <option key={model.id} value={model.id} disabled={!model.available}>{model.label}{model.available ? "" : " (key required)"}</option>)}
          </select>
        </label>
        {props.models && !props.models.models.find(model => model.id === props.modelId)?.available && <small>Add the selected provider API key to the backend environment to enable AI generation.</small>}
        {props.page && (
          <div className="wh-segment">
            <button
              type="button"
              aria-pressed={mode === "edit"}
              onClick={() => setMode("edit")}
            >
              Edit page
            </button>
            <button
              type="button"
              aria-pressed={mode === "new"}
              onClick={() => setMode("new")}
            >
              New page
            </button>
          </div>
        )}
        {(mode === "new" || !props.page) && (
          <label>
            New page slug
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={100}
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              disabled={props.busy || !props.canWrite}
            />
          </label>
        )}
        <label>
          {mode === "edit" && props.page
            ? "Ask Kora to change this page"
            : "Describe your page"}
          <textarea
            required
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={6000}
            disabled={props.busy || !props.canWrite}
            placeholder={
              props.page && mode === "edit"
                ? "Make the hero more premium and simplify the services section…"
                : "A premium website for my business…"
            }
          />
        </label>
        <button
          className="kw-primary"
          disabled={props.busy || !props.canWrite || !prompt.trim()}
        >
          <Send size={13} />
          {props.busy
            ? "Working…"
            : mode === "edit" && props.page
              ? "Prepare changes"
              : "Generate page"}
        </button>
        {(mode === "new" || !props.page) && (
          <button
            type="button"
            disabled={props.busy || !props.canWrite}
            onClick={() => props.onBlank(slug)}
          >
            <Plus size={13} />
            Start with a blank page
          </button>
        )}
      </form>
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
      >
        <DialogContent className="wh-dialog wa-review">
          <DialogHeader>
            <DialogTitle>Review Kora changes</DialogTitle>
            <DialogDescription>
              Compare the accepted draft with the proposal. Applying is blocked
              if the page has changed.
            </DialogDescription>
          </DialogHeader>
          <div className="kw-app wh-dialog-body">
            {review && (
              <>
                <div className="wa-comparison">
                  <div>
                    <h3>Current draft</h3>
                    <iframe
                      title="Current draft review"
                      sandbox=""
                      srcDoc={previewDocument(
                        props.page?.html || "",
                        props.page?.css || "",
                      )}
                    />
                  </div>
                  <div>
                    <h3>Kora proposal</h3>
                    <iframe
                      title="Kora proposal review"
                      sandbox=""
                      srcDoc={previewDocument(review.html, review.css)}
                    />
                  </div>
                </div>
                <div className="wr-actions">
                  <button disabled={props.busy} onClick={() => setReview(null)}>
                    Back to editor
                  </button>
                  <button
                    className="kw-primary"
                    disabled={
                      props.busy ||
                      !props.canWrite ||
                      review.page_id !== props.page?._id
                    }
                    onClick={() => action(review._id, "apply")}
                  >
                    Apply changes
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
