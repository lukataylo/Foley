// Render a step's narration text on /docs/<id>. Plain prose by default,
// but with two opt-in primitives (Mintlify-parity, lightweight):
//
//   ```mermaid
//   graph TD; A-->B
//   ```
//      → emits <pre class="docs-mermaid"> blocks. A tiny client script
//        (MermaidHydrator) loads mermaid.js from a CDN once and renders
//        every block to an SVG.
//
//   > [!NOTE]
//   > Some text
//      → emits <aside class="docs-callout note">. Supports NOTE / TIP /
//        WARNING / IMPORTANT (matches GitHub's GFM convention).
//
// Plain paragraphs render as <p>. Lines without a special prefix go
// through React's text node escaping for free.

import type { JSX, ReactNode } from "react";

type CalloutKind = "note" | "tip" | "warning" | "important";
const CALLOUT_LABEL: Record<CalloutKind, string> = {
  note: "Note",
  tip: "Tip",
  warning: "Warning",
  important: "Important",
};

function parseCalloutHeader(line: string): CalloutKind | null {
  const m = line.match(/^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT)]\s*$/i);
  if (!m) return null;
  return m[1].toLowerCase() as CalloutKind;
}

function stripQuote(line: string): string {
  return line.replace(/^>\s?/, "");
}

interface Block {
  kind: "p" | "mermaid" | "callout";
  body: string;
  callout?: CalloutKind;
}

function tokeniseNarration(src: string): Block[] {
  const lines = src.split(/\r?\n/);
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Mermaid fenced block.
    const fence = line.match(/^\s*```mermaid\s*$/);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      // Skip closing fence.
      if (i < lines.length) i++;
      out.push({ kind: "mermaid", body: buf.join("\n") });
      continue;
    }

    // Callout.
    const calloutKind = parseCalloutHeader(line);
    if (calloutKind) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        buf.push(stripQuote(lines[i]));
        i++;
      }
      out.push({ kind: "callout", callout: calloutKind, body: buf.join("\n").trim() });
      continue;
    }

    // Paragraph — accumulate non-blank lines until a blank.
    if (line.trim() === "") {
      i++;
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].match(/^\s*```mermaid\s*$/) && parseCalloutHeader(lines[i]) === null) {
      buf.push(lines[i]);
      i++;
    }
    out.push({ kind: "p", body: buf.join(" ").trim() });
  }
  return out;
}

/** Render a step's narration as a stack of React elements, supporting
 *  GFM-style callouts and ```mermaid blocks. Plain prose still renders
 *  as a single <p>, so steps with no markup look identical to before. */
export function renderNarration(src: string, keyPrefix: string): ReactNode {
  const blocks = tokeniseNarration(src ?? "");
  if (blocks.length === 0) return null;
  return blocks.map((b, i): JSX.Element => {
    const k = `${keyPrefix}-${i}`;
    switch (b.kind) {
      case "mermaid":
        return (
          <pre key={k} className="docs-mermaid" data-mermaid-source>
            {b.body}
          </pre>
        );
      case "callout":
        return (
          <aside key={k} className={`docs-callout ${b.callout}`}>
            <span className="docs-callout-label">
              {b.callout ? CALLOUT_LABEL[b.callout] : "Note"}
            </span>
            <span>{b.body}</span>
          </aside>
        );
      case "p":
      default:
        return (
          <p key={k} className="narration">
            {b.body}
          </p>
        );
    }
  });
}
