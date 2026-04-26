"use client";

import { useState } from "react";

interface Props {
  walkthroughId: string;
  displayName: string;
  videoUrl: string;
  /** Take id to render — defaults to "master". The editor passes the take it's
   *  open on so users can publish their in-progress cut, not just the canonical
   *  master. Self-host export still bundles the master mp4 since that's the
   *  walkthrough's published page. */
  takeId?: string;
  /** Optional className override so the editor can use its own toolbar style. */
  className?: string;
}

type Mode = "menu" | "self" | "youtube";

interface ExportResult { url: string; bytes: number; music_tracks: number; cached?: boolean; }

export function PublishButton({ walkthroughId, displayName, videoUrl, takeId = "master", className }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [busy, setBusy] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  function close() {
    setOpen(false);
    setMode("menu");
  }

  async function exportMp4() {
    setBusy(true);
    setExportResult(null);
    try {
      const res = await fetch(`/api/walkthroughs/${walkthroughId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ take_id: takeId }),
      });
      const json = await res.json() as ExportResult & { error?: string; ok?: boolean };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "Export failed");
        return;
      }
      setExportResult(json);
      // Trigger download immediately.
      const a = document.createElement("a");
      a.href = json.url;
      a.download = `${walkthroughId}-${takeId}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(false);
    }
  }

  async function exportSelfHost() {
    setBusy(true);
    try {
      const res = await fetch(`/api/publish/static?id=${encodeURIComponent(walkthroughId)}`);
      if (!res.ok) {
        alert("Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${walkthroughId}-foley.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={className ?? "btn-primary publish-btn"} type="button" onClick={() => setOpen(true)}>
        <PaperPlane /> Publish
      </button>
      {open ? (
        <div className="publish-overlay" onClick={close}>
          <div className="publish-modal" onClick={(e) => e.stopPropagation()}>
            <div className="publish-modal-head">
              <div>
                <h3>Publish {displayName}</h3>
                <p className="publish-sub">
                  Ship this walkthrough as a self-hosted page or a video file.
                </p>
              </div>
              <button className="publish-close" onClick={close} aria-label="Close">×</button>
            </div>

            {mode === "menu" && (
              <div className="publish-options">
                <button className="publish-option" onClick={() => setMode("self")}>
                  <div className="publish-option-icon"><GlobeIcon /></div>
                  <div>
                    <div className="publish-option-title">Self-host</div>
                    <div className="publish-option-desc">
                      Download a single HTML file with the video, captions, and steps inline.
                      Drop it on any web host.
                    </div>
                  </div>
                  <div className="publish-option-cta">→</div>
                </button>

                <button className="publish-option" onClick={() => setMode("youtube")}>
                  <div className="publish-option-icon"><YouTubeIcon /></div>
                  <div>
                    <div className="publish-option-title">YouTube
                      <span className="publish-option-badge">soon</span>
                    </div>
                    <div className="publish-option-desc">
                      Authenticate once with your channel; Foley will upload
                      and re-upload on every approved master.
                    </div>
                  </div>
                  <div className="publish-option-cta">→</div>
                </button>
              </div>
            )}

            {mode === "self" && (
              <div className="publish-pane">
                <button className="publish-back" onClick={() => setMode("menu")}>← back</button>
                <h4>Self-hosted HTML</h4>
                <p className="publish-sub">
                  We'll bundle the master video, narration captions, and step
                  reference into one HTML file. ~2-5MB, no server needed.
                </p>
                <ul className="publish-bullets">
                  <li>Single file, all assets embedded</li>
                  <li>Lighthouse-friendly, no JS framework</li>
                  <li>Includes Foley watermark — removable on a paid plan</li>
                </ul>
                <div className="publish-actions">
                  <button
                    className="onboard-btn onboard-btn-primary"
                    onClick={exportSelfHost}
                    disabled={busy}
                  >
                    {busy ? "Exporting…" : "Export & download HTML"}
                  </button>
                </div>
              </div>
            )}

            {mode === "youtube" && (
              <div className="publish-pane">
                <button className="publish-back" onClick={() => setMode("menu")}>← back</button>
                <h4>Download mp4 for YouTube</h4>
                <p className="publish-sub">
                  We bake the master video with any music tracks you've added in
                  the editor mixed in. Drop the resulting mp4 into YouTube
                  Studio's upload flow.
                </p>
                <ul className="publish-bullets">
                  <li>H.264 video, AAC audio, +faststart for streaming</li>
                  <li>Music clips on the timeline are mixed at their start times</li>
                  <li>YouTube re-encodes anyway — this output is ingest-ready</li>
                </ul>
                <div className="publish-yt-mock">
                  <div className="publish-yt-thumb" style={{ backgroundImage: `url(${videoUrl.replace(/\.mp4$/, "")}.png)` }} />
                  <div className="publish-yt-meta">
                    <strong>{displayName}</strong>
                    <span>1080p · narration + music · Foley</span>
                  </div>
                </div>
                <div className="publish-actions">
                  <button
                    className="onboard-btn onboard-btn-primary"
                    onClick={exportMp4}
                    disabled={busy}
                  >
                    {busy ? "Rendering…" : exportResult ? "Re-export & download" : "Export & download mp4"}
                  </button>
                </div>
                {exportResult ? (
                  <p className="ci-help" style={{ marginTop: 12 }}>
                    {exportResult.cached ? "Served from cache — " : "Rendered fresh — "}
                    {(exportResult.bytes / (1024 * 1024)).toFixed(1)} MB ·
                    {" "}{exportResult.music_tracks} music track{exportResult.music_tracks === 1 ? "" : "s"} mixed
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function PaperPlane() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" />
    </svg>
  );
}
function YouTubeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.6 7.2c-.2-.9-1-1.6-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3C3.4 5.6 2.6 6.3 2.4 7.2 2 8.9 2 12 2 12s0 3.1.4 4.8c.2.9 1 1.6 1.9 1.9 1.7.3 7.7.3 7.7.3s6 0 7.7-.3c.9-.2 1.7-1 1.9-1.9.4-1.7.4-4.8.4-4.8s0-3.1-.4-4.8zM10 15V9l5 3-5 3z" />
    </svg>
  );
}
