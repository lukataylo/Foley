"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  walkthroughId: string;
  walkthroughVersion: number;
  initialTitle: string;
}

export function EditableTitle({ walkthroughId, walkthroughVersion, initialTitle }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function save() {
    const next = title.trim();
    if (!next || next === initialTitle) {
      setTitle(initialTitle);
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/walkthroughs/${walkthroughId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: next }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        // Revert on failure.
        setTitle(initialTitle);
        setEditing(false);
      }
    } catch {
      setTitle(initialTitle);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      setTitle(initialTitle);
      setEditing(false);
    }
  }

  return (
    <div className="wt-titleblock">
      <p className="detail-eyebrow">Project · v{walkthroughVersion}</p>
      {editing ? (
        <input
          ref={inputRef}
          className="detail-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={onKey}
          disabled={busy}
        />
      ) : (
        <h1
          className="detail-title editable"
          onClick={() => setEditing(true)}
          title="Click to rename"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}
        >
          {title}
          <span className="rename-hint" aria-hidden="true">  ✎</span>
        </h1>
      )}
    </div>
  );
}
