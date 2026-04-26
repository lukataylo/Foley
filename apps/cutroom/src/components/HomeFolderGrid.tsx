"use client";

// Client wrapper around the home grid so we can attach a context menu
// (right-click → delete) without converting the whole page to client.
// The folder render itself stays presentational; this component owns
// the menu state + the DELETE call.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Folder } from "@/components/Folder";

export interface HomeItem {
  id: string;
  name: string;
  mark: string;
  sub: string;
  meta: string;
  href: string;
  variant: "default" | "muted";
  tone: "blue" | "amber" | "graphite" | "mint" | "violet" | "rose";
  thumbs: string[];
  glyph?: string;
  tag?: "sample" | "soon";
}

interface ContextState {
  id: string;
  name: string;
  x: number;
  y: number;
}

export function HomeFolderGrid({ items }: { items: HomeItem[] }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<ContextState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click-outside / Escape.
  useEffect(() => {
    if (!ctx) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setCtx(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCtx(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctx]);

  function openMenu(e: React.MouseEvent, item: HomeItem) {
    e.preventDefault();
    setCtx({
      id: item.id,
      name: item.name,
      // Keep the menu fully inside the viewport on right-edge clicks.
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 80),
    });
  }

  async function deleteWalkthrough() {
    if (!ctx) return;
    const target = ctx;
    if (
      !confirm(
        `Delete "${target.name}"?\n\nThis removes walkthroughs/${target.id}/ and every take inside it. Cannot be undone.`,
      )
    ) {
      setCtx(null);
      return;
    }
    setBusy(target.id);
    setCtx(null);
    try {
      const r = await fetch(`/api/walkthroughs/${target.id}`, {
        method: "DELETE",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        alert(`Delete failed: ${j?.error ?? `HTTP ${r.status}`}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="folder-grid">
      {items.map((item) => {
        const card = (
          <div
            className={`folder-card ${item.variant === "muted" ? "placeholder" : ""} ${busy === item.id ? "is-deleting" : ""}`}
          >
            <Folder
              thumbs={item.thumbs}
              mark={item.mark}
              glyph={item.glyph}
              tone={item.tone}
              variant={item.variant}
            />
            <div className="folder-meta">
              <div className="folder-title">{item.name}</div>
              <div className="folder-sub">{item.sub}</div>
              <div className="folder-sub">{item.meta}</div>
              {item.tag ? (
                <div className="folder-tag">
                  {item.tag === "sample" ? "sample" : "coming soon"}
                </div>
              ) : null}
            </div>
          </div>
        );
        return (
          <Link
            key={item.id}
            href={item.href}
            onContextMenu={(e) => openMenu(e, item)}
          >
            {card}
          </Link>
        );
      })}

      <Link href="/onboard" className="folder-card placeholder">
        <Folder mark="" glyph="+" tone="violet" variant="muted" />
        <div className="folder-meta">
          <div className="folder-title">New walkthrough</div>
          <div className="folder-sub">Bootstrap from a repo</div>
        </div>
      </Link>

      {ctx ? (
        <div
          ref={menuRef}
          className="home-context-menu"
          style={{ left: ctx.x, top: ctx.y }}
          role="menu"
        >
          <div className="home-context-head">{ctx.name}</div>
          <button
            type="button"
            role="menuitem"
            className="home-context-item home-context-danger"
            onClick={deleteWalkthrough}
          >
            <span aria-hidden>🗑</span> Delete walkthrough
          </button>
          <button
            type="button"
            role="menuitem"
            className="home-context-item"
            onClick={() => setCtx(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
