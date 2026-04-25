"use client";

import { useState } from "react";

interface Props {
  walkthroughId: string;
  displayName: string;
  videoUrl: string;
}

type Mode = "menu" | "self" | "youtube" | "embed";

export function PublishButton({ walkthroughId, displayName, videoUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setMode("menu");
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
      <button className="btn-primary publish-btn" type="button" onClick={() => setOpen(true)}>
        <PaperPlane /> Publish
      </button>
      {open ? (
        <div className="publish-overlay" onClick={close}>
          <div className="publish-modal" onClick={(e) => e.stopPropagation()}>
            <div className="publish-modal-head">
              <div>
                <h3>Publish {displayName}</h3>
                <p className="publish-sub">
                  Ship this walkthrough as a self-hosted page, embed, or video.
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

                <button className="publish-option" onClick={() => setMode("embed")}>
                  <div className="publish-option-icon"><CodeIcon /></div>
                  <div>
                    <div className="publish-option-title">Embed</div>
                    <div className="publish-option-desc">
                      Drop into Notion, Webflow, or any docs site with one
                      iframe snippet.
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

            {mode === "embed" && (
              <div className="publish-pane">
                <button className="publish-back" onClick={() => setMode("menu")}>← back</button>
                <h4>Embed snippet</h4>
                <p className="publish-sub">Paste this into any HTML or markdown-iframe block.</p>
                <pre className="publish-code">{`<iframe
  src="https://foley.app/embed/${walkthroughId}"
  width="800"
  height="450"
  frameborder="0"
  allow="autoplay; fullscreen"
></iframe>`}</pre>
                <div className="publish-actions">
                  <button
                    className="onboard-btn onboard-btn-primary"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `<iframe src="https://foley.app/embed/${walkthroughId}" width="800" height="450" frameborder="0" allow="autoplay; fullscreen"></iframe>`,
                      );
                    }}
                  >
                    Copy snippet
                  </button>
                </div>
              </div>
            )}

            {mode === "youtube" && (
              <div className="publish-pane">
                <button className="publish-back" onClick={() => setMode("menu")}>← back</button>
                <h4>YouTube — coming soon</h4>
                <p className="publish-sub">
                  Once your channel's connected, every approved master is
                  uploaded as an unlisted video. New PRs replace the upload
                  in-place so links don't break.
                </p>
                <div className="publish-yt-mock">
                  <div className="publish-yt-thumb" style={{ backgroundImage: `url(${videoUrl.replace(/\.mp4$/, "")}.png)` }} />
                  <div className="publish-yt-meta">
                    <strong>{displayName}</strong>
                    <span>0 views · just now · Foley</span>
                  </div>
                </div>
                <div className="publish-actions">
                  <button className="onboard-btn onboard-btn-primary" disabled>
                    Connect YouTube channel
                  </button>
                </div>
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
function CodeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
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
