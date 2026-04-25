// Bootstrap-from-repo wizard isn't built in this drop. Lightweight placeholder
// so the "+ New" tile on the home isn't a dead link.

import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

export default function NewWalkthroughPage() {
  return (
    <main className="home">
      <div className="home-inner" style={{ maxWidth: 720 }}>
        <header className="home-header">
          <Link href="/" className="brand-mark">Foley</Link>
          <ThemeToggle />
        </header>

        <p className="detail-eyebrow">New walkthrough</p>
        <h1 className="home-section-title">Bootstrap from a repo</h1>

        <div
          className="sticky sticky-paper"
          style={{ marginTop: 32, padding: "22px 22px 18px" }}
        >
          <h2>Add a walkthrough by hand</h2>
          <p style={{ marginBottom: 12 }}>
            The bootstrap-from-repo flow isn&apos;t wired up in this build. To add a
            walkthrough manually:
          </p>
          <ol style={{ paddingLeft: 22, lineHeight: 1.7 }}>
            <li>
              Create <code>walkthroughs/&lt;id&gt;/walkthrough.yaml</code> with steps,
              actions, and narration.
            </li>
            <li>
              Add <code>walkthroughs/&lt;id&gt;/brand.yaml</code> with voice, palette,
              pacing.
            </li>
            <li>
              Run <code>pnpm director ingest &lt;id&gt;</code>, then{" "}
              <code>pnpm director master &lt;id&gt;</code>.
            </li>
            <li>Refresh the home — your folder appears alongside Loop.</li>
          </ol>
          <Link href="/" className="btn-secondary" style={{ marginTop: 20 }}>
            ← Back to walkthroughs
          </Link>
        </div>
      </div>
    </main>
  );
}
