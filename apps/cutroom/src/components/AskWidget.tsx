"use client";

// "Ask this walkthrough" — pinned-bottom-right widget on /docs/<id>.
// Fires /api/walkthroughs/<id>/ask, renders Claude's answer + clickable
// step-id citations.

import { useEffect, useRef, useState } from "react";

interface Props {
  walkthroughId: string;
}

interface Answer {
  question: string;
  answer: string;
  citations: string[];
}

export function AskWidget({ walkthroughId }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Answer[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history.length]);

  async function ask() {
    const q = draft.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setDraft("");
    try {
      const r = await fetch(`/api/walkthroughs/${walkthroughId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await r.json()) as {
        ok: boolean;
        answer?: string;
        citations?: string[];
        message?: string;
      };
      if (!r.ok || !data.ok) {
        setError(data.message ?? `HTTP ${r.status}`);
        // Restore the question so the user can retry.
        setDraft(q);
        return;
      }
      setHistory((prev) => [
        ...prev,
        { question: q, answer: data.answer ?? "", citations: data.citations ?? [] },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
      setDraft(q);
    } finally {
      setBusy(false);
    }
  }

  function jumpToStep(stepId: string) {
    // Each step's <li> uses key={step.id} which React renders as no
    // explicit DOM id; we anchor via the docs-step-num index instead.
    // Simpler: scroll any <h2> matching the step's title — the docs
    // page renders one h2 per step. We find the matching cue by id
    // attribute we'll add on the docs page.
    const node = document.querySelector(`[data-step-id="${stepId}"]`);
    if (node && "scrollIntoView" in node) {
      (node as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
      (node as HTMLElement).classList.add("docs-step-flash");
      setTimeout(() => (node as HTMLElement).classList.remove("docs-step-flash"), 1500);
    }
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="ask-widget-launcher"
          onClick={() => setOpen(true)}
          aria-label="Ask this walkthrough"
        >
          <span className="ask-widget-launcher-icon">✨</span>
          Ask this walkthrough
        </button>
      ) : (
        <div className="ask-widget" role="dialog" aria-label="Ask this walkthrough">
          <header className="ask-widget-head">
            <span className="ask-widget-title">Ask this walkthrough</span>
            <button
              type="button"
              className="ask-widget-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </header>
          <div className="ask-widget-body">
            {history.length === 0 ? (
              <div className="ask-widget-empty">
                Ask anything about this walkthrough — Claude reads the
                transcript and cites the steps it draws from.
                <br />
                <em>Try: &ldquo;How do I sign in?&rdquo;</em>
              </div>
            ) : (
              history.map((qa, i) => (
                <div key={i} className="ask-widget-turn">
                  <div className="ask-widget-question">{qa.question}</div>
                  <div className="ask-widget-answer">{qa.answer}</div>
                  {qa.citations.length > 0 ? (
                    <div className="ask-widget-citations">
                      {qa.citations.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="ask-widget-citation"
                          onClick={() => jumpToStep(c)}
                          title={`Jump to step "${c}"`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
            <div ref={tailRef} />
          </div>
          {error ? <div className="ask-widget-error">{error}</div> : null}
          <form
            className="ask-widget-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="ask-widget-input"
              placeholder={busy ? "Thinking…" : "Ask a question"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              maxLength={500}
            />
            <button
              type="submit"
              className="ask-widget-send"
              disabled={busy || !draft.trim()}
            >
              {busy ? "…" : "↵"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
