import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DownloadPage() {
  return (
    <main className="welcome">
      <div className="welcome-topbar">
        <div className="welcome-brand">
          <Link href="/welcome" className="welcome-brand" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="welcome-brand-name">← Foley</span>
          </Link>
        </div>
      </div>

      <section className="welcome-hero" style={{ marginTop: 120 }}>
        <h1 className="welcome-headline" style={{ fontSize: 44 }}>
          The macOS app is coming.
        </h1>
        <p className="welcome-sub">
          Foley desktop signs you into GitHub, watches your repos for changes,
          and bakes new walkthroughs locally. We're shipping the notarized
          build right after the hackathon.
        </p>
        <p className="welcome-sub" style={{ marginTop: -10 }}>
          In the meantime, the studio runs anywhere you can run Node.
        </p>
        <div className="welcome-cta-row">
          <Link href="/onboard" className="welcome-cta welcome-cta-primary">
            <span className="welcome-cta-main">Use the web studio</span>
          </Link>
          <Link href="/welcome" className="welcome-cta welcome-cta-ghost">
            <span className="welcome-cta-main">Back to home</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
