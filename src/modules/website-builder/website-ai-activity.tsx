"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Clock3, Loader2, Sparkles, TriangleAlert, X } from "lucide-react";

export type AIActivity = {
  kind: "generate" | "edit";
  status: "running" | "success" | "error";
  prompt: string;
  model: string;
  startedAt: number;
  finishedAt?: number;
  error?: string;
};

type Props = {
  activity: AIActivity;
  canRetry: boolean;
  onDismiss: () => void;
};

export function WebsiteAIActivity({ activity, canRetry, onDismiss }: Props) {
  const [now, setNow] = useState(activity.startedAt);
  const running = activity.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running, activity.startedAt]);

  const seconds = Math.max(0, Math.floor(((activity.finishedAt ?? now) - activity.startedAt) / 1000));
  const duration = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const creating = activity.kind === "generate";
  const titles = creating ? {
    running: "Kora is creating your page",
    error: "Page generation failed",
    success: "Your page is ready",
  } : {
    running: "Kora is preparing your changes",
    error: "AI edit failed",
    success: "Your changes are ready to review",
  };
  const descriptions = {
    running: "Your request is in progress",
    success: "Completed",
    error: "Check the error and try again",
  };
  const responseDetails = {
    running: "Waiting for the AI response",
    success: "AI response received",
    error: "Request failed",
  };
  const responseStates = { running: "active", success: "done", error: "error" } as const;
  const stepIcons = { done: Check, active: Loader2, error: TriangleAlert, pending: Circle };
  const steps = [
    { title: "Request started", detail: `Using ${activity.model}`, state: "done" as const },
    {
      title: creating ? "Generate page content and styles" : "Prepare the updated page and change summary",
      detail: responseDetails[activity.status],
      state: responseStates[activity.status],
    },
    {
      title: creating ? "Save the draft and open the preview" : "Save the proposal for your review",
      detail: activity.status === "error"
        ? "Completion could not be confirmed"
        : activity.status === "success"
          ? creating ? "Draft saved and opened below" : "Review or apply the proposal in the Kora panel"
          : "Waiting for a complete response",
      state: activity.status === "success" ? "done" as const : "pending" as const,
    },
  ];

  return (
    <section className={`wai-activity is-${activity.status}`} aria-label="AI activity">
      <header className="wai-heading">
        <div className="wai-symbol">
          <Sparkles size={20} />
        </div>
        <div aria-live="polite">
          <h2>{titles[activity.status]}</h2>
          <p>{descriptions[activity.status]}</p>
        </div>
        <span className="wai-elapsed" role="timer" aria-label={`Elapsed time ${duration}`}>
          <Clock3 size={13} />
          {duration}
        </span>
        {!running && (
          <button type="button" aria-label="Dismiss AI activity" onClick={onDismiss}>
            <X size={15} />
          </button>
        )}
      </header>
      {running && <div className="wai-progress" aria-hidden="true"><span /></div>}
      <details>
      <summary>View activity details</summary>
      <ol className="wai-steps">
        {steps.map(step => {
          const Icon = stepIcons[step.state];
          return (
            <li key={step.title} className={`is-${step.state}`}>
              <Icon size={16} className={step.state === "active" ? "kw-spin" : undefined} />
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
            </li>
          );
        })}
      </ol>
      </details>
      {running && seconds >= 20 && (
        <p className="wai-detail">
          Still waiting for {activity.model}. Larger pages can take longer.
          Elapsed time shows how long this request has been running.
        </p>
      )}
      {activity.status === "error" && (
        <div className="wai-error">
          <p role="alert">{activity.error}</p>
          <button type="submit" form="website-ai-composer" className="kw-primary" disabled={!canRetry}>
            Retry request
          </button>
        </div>
      )}
    </section>
  );
}
