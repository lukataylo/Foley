"use client";

// Hydrate every <pre data-mermaid-source> block into a real diagram by
// lazy-loading mermaid from a CDN. We only fetch the library if a
// mermaid block is actually on the page — most walkthroughs have none.

import { useEffect } from "react";

declare global {
  interface Window {
    __foleyMermaidLoaded?: Promise<unknown>;
    mermaid?: { initialize?: (opts: unknown) => void; run?: (opts?: unknown) => Promise<void> };
  }
}

const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

async function ensureMermaid() {
  if (typeof window === "undefined") return null;
  if (!window.__foleyMermaidLoaded) {
    window.__foleyMermaidLoaded = (async () => {
      const mod = await import(/* webpackIgnore: true */ MERMAID_URL);
      const m = (mod as { default?: typeof window.mermaid }).default ?? mod;
      window.mermaid = m as typeof window.mermaid;
      m.initialize?.({ startOnLoad: false, theme: "default", securityLevel: "strict" });
      return m;
    })();
  }
  return window.__foleyMermaidLoaded;
}

export function MermaidHydrator() {
  useEffect(() => {
    const blocks = document.querySelectorAll<HTMLElement>("pre[data-mermaid-source]");
    if (blocks.length === 0) return;
    let cancelled = false;
    void (async () => {
      await ensureMermaid();
      if (cancelled || !window.mermaid?.run) return;
      // Wrap each <pre> in a <div class="mermaid"> with the source text;
      // mermaid.run() finds those and replaces with SVG.
      blocks.forEach((pre, idx) => {
        if (pre.dataset.mermaidHydrated === "1") return;
        const div = document.createElement("div");
        div.className = "mermaid docs-mermaid-rendered";
        div.id = `foley-mermaid-${idx}`;
        div.textContent = pre.textContent ?? "";
        pre.replaceWith(div);
      });
      try {
        await window.mermaid.run({ querySelector: ".docs-mermaid-rendered" });
      } catch {
        // Mermaid throws on bad syntax; the original <pre> is gone but
        // the container shows a partial render. Acceptable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
