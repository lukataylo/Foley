"use client";

// Per-page thumbs feedback. Sits in the docs footer; a 👍/👎 reveals an
// optional note field after the click, then POSTs to
// /api/walkthroughs/[id]/feedback.

import { useState } from "react";

interface Props {
  walkthroughId: string;
}

export function FeedbackWidget({ walkthroughId }: Props) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(r: "up" | "down", noteText: string) {
    setBusy(true);
    try {
      await fetch(`/api/walkthroughs/${walkthroughId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: r, note: noteText }),
      });
      setSubmitted(true);
    } catch {
      // Soft-fail — don't block the user.
      setSubmitted(true);
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return <div className="feedback-widget feedback-thanks">Thanks for the feedback.</div>;
  }

  if (rating === null) {
    return (
      <div className="feedback-widget">
        <span className="feedback-prompt">Was this walkthrough useful?</span>
        <button
          type="button"
          className="feedback-btn"
          onClick={() => {
            setRating("up");
            void send("up", "");
          }}
          aria-label="Yes"
          disabled={busy}
        >
          👍
        </button>
        <button
          type="button"
          className="feedback-btn"
          onClick={() => setRating("down")}
          aria-label="No — tell us why"
          disabled={busy}
        >
          👎
        </button>
      </div>
    );
  }

  // Down rating — collect a note.
  return (
    <form
      className="feedback-widget feedback-note-form"
      onSubmit={(e) => {
        e.preventDefault();
        void send("down", note.trim());
      }}
    >
      <span className="feedback-prompt">What could be better?</span>
      <input
        type="text"
        className="feedback-note-input"
        placeholder="Optional — what was missing or wrong?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        autoFocus
        disabled={busy}
      />
      <button type="submit" className="feedback-btn-submit" disabled={busy}>
        {busy ? "…" : "Send"}
      </button>
    </form>
  );
}
