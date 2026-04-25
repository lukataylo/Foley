"use client";

// Mintlify-style "Open in <AI>" contextual menu. Pre-fills a question for
// Claude / ChatGPT / Perplexity / Cursor with the walkthrough's .md URL,
// so a reader can hand the doc to the LLM in one click.

import { useState } from "react";

interface Props {
  walkthroughId: string;
}

interface Target {
  id: string;
  label: string;
  href: (mdUrl: string) => string;
  glyph: string;
}

const TARGETS: Target[] = [
  {
    id: "claude",
    label: "Claude",
    glyph: "✦",
    href: (mdUrl) =>
      `https://claude.ai/new?q=${encodeURIComponent(
        `I'd like to learn about a product. Read this walkthrough first, then I'll ask questions.\n\n${mdUrl}`,
      )}`,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    glyph: "◎",
    href: (mdUrl) =>
      `https://chat.openai.com/?q=${encodeURIComponent(
        `Read this product walkthrough, then answer my questions:\n\n${mdUrl}`,
      )}`,
  },
  {
    id: "perplexity",
    label: "Perplexity",
    glyph: "✺",
    href: (mdUrl) =>
      `https://www.perplexity.ai/?q=${encodeURIComponent(
        `Summarise this product walkthrough: ${mdUrl}`,
      )}`,
  },
  {
    id: "cursor",
    label: "Cursor (deeplink)",
    glyph: "▶",
    href: (mdUrl) =>
      `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(
        `Read this walkthrough and tell me how the product works:\n\n${mdUrl}`,
      )}`,
  },
];

export function OpenInLLMMenu({ walkthroughId }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Compute the absolute markdown URL on the client so it carries the
  // user's host (works behind ngrok or a deployed instance, not just dev).
  const mdUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/docs/${walkthroughId}.md`
      : `/docs/${walkthroughId}.md`;

  async function copyMarkdown() {
    if (typeof window === "undefined") return;
    try {
      const r = await fetch(`/docs/${walkthroughId}.md`);
      const text = await r.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: copy the URL.
      try {
        await navigator.clipboard.writeText(mdUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        // ignore
      }
    }
  }

  return (
    <div className="open-in-llm">
      <button
        type="button"
        className="open-in-llm-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Open in <span className="open-in-llm-chev">▾</span>
      </button>
      {open ? (
        <div className="open-in-llm-menu" role="menu">
          {TARGETS.map((t) => (
            <a
              key={t.id}
              role="menuitem"
              href={t.href(mdUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="open-in-llm-item"
              onClick={() => setOpen(false)}
            >
              <span className="open-in-llm-glyph">{t.glyph}</span>
              {t.label}
            </a>
          ))}
          <div className="open-in-llm-divider" />
          <button
            type="button"
            role="menuitem"
            className="open-in-llm-item"
            onClick={() => {
              void copyMarkdown();
              setOpen(false);
            }}
          >
            <span className="open-in-llm-glyph">⎘</span>
            {copied ? "Copied!" : "Copy as Markdown"}
          </button>
          <a
            role="menuitem"
            href={mdUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="open-in-llm-item open-in-llm-mono"
            onClick={() => setOpen(false)}
          >
            <span className="open-in-llm-glyph">.md</span>
            View as Markdown
          </a>
        </div>
      ) : null}
    </div>
  );
}
