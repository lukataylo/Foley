import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

export default function WelcomePage() {
  return (
    <main className="welcome">
      <div className="welcome-topbar">
        <div className="welcome-brand">
          <BrandMark />
          <span className="welcome-brand-name">Foley</span>
        </div>
        <div className="welcome-topbar-actions">
          <Link href="/" className="welcome-link">Open studio</Link>
          <ThemeToggle />
        </div>
      </div>

      <section className="welcome-hero">
        <div className="welcome-logo-lockup">
          <BrandMark size={64} />
          <span className="welcome-logo-name">Foley</span>
        </div>
        <h1 className="welcome-headline">
          Walkthroughs that<br />
          maintain themselves.
        </h1>
        <p className="welcome-sub">
          Auto-generate on-brand product documentation from your GitHub
          repository — videos, step-by-step guides, and written tours that
          stay current as your code evolves. Connect once. Ships forever.
        </p>

        <div className="welcome-cta-row">
          <Link href="/download" className="welcome-cta welcome-cta-primary">
            <AppleGlyph />
            <span>
              <span className="welcome-cta-pre">Download for</span>
              <span className="welcome-cta-main">macOS</span>
            </span>
          </Link>
          <Link href="/onboard" className="welcome-cta welcome-cta-ghost">
            <span className="welcome-cta-main">Get started — it's free</span>
          </Link>
        </div>

        <div className="welcome-cta-foot">
          <Link href="https://chrome.google.com/webstore" className="welcome-foot-link">
            <ChromeGlyph /> Get the Chrome extension
          </Link>
          <span className="welcome-foot-sep">·</span>
          <Link href="/onboard" className="welcome-foot-link">
            <GithubGlyph /> Continue with GitHub
          </Link>
        </div>
      </section>

      <section className="welcome-mockup">
        <LaptopMockup />
      </section>

      <section className="welcome-explainer">
        <div className="welcome-explainer-grid">
          <ExplainerCard
            tone="amber"
            num="01"
            label="CONNECT"
            title="Point Foley at your repo"
            blurb="Sign in with GitHub, pick a repository, and Foley analyzes
            your product surface — pages, flows, components."
            icon={<RepoIcon />}
          />
          <ExplainerCard
            tone="mint"
            num="02"
            label="CAPTURE"
            title="Drafted, then captured"
            blurb="Claude reads your landing page and drafts the steps.
            Playwright captures each one. ElevenLabs narrates in your
            cloned voice. No setup."
            icon={<CaptureIcon />}
          />
          <ExplainerCard
            tone="lavender"
            num="03"
            label="CUT"
            title="Edit takes in the studio"
            blurb="Trim, restage, and re-record any scene in the cutroom.
            Director takes notes — agents apply them."
            icon={<CutIcon />}
          />
          <ExplainerCard
            tone="sky"
            num="04"
            label="MAINTAIN"
            title="Updates on every PR"
            blurb="Foley diffs your steps against the live UI, retakes only
            what changed, and re-publishes the master."
            icon={<MaintainIcon />}
          />
        </div>
      </section>

      <section className="welcome-final-cta">
        <h2>Stop maintaining docs by hand.</h2>
        <p>Foley does it autonomously, end-to-end, on brand.</p>
        <div className="welcome-cta-row welcome-cta-row-center">
          <Link href="/onboard" className="welcome-cta welcome-cta-primary">
            <span className="welcome-cta-main">Connect a repository</span>
          </Link>
          <Link href="/" className="welcome-cta welcome-cta-ghost">
            <span className="welcome-cta-main">See sample walkthrough</span>
          </Link>
        </div>
      </section>

      <footer className="welcome-footer">
        <span>Foley · made for the To The Americas hackathon</span>
        <span className="welcome-footer-dot">·</span>
        <span>Voice by ElevenLabs · Capture by Playwright · Composed with Claude</span>
      </footer>
    </main>
  );
}

function ExplainerCard({
  tone,
  num,
  label,
  title,
  blurb,
  icon,
}: {
  tone: "amber" | "mint" | "lavender" | "sky";
  num: string;
  label: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
}) {
  return (
    <article className={`welcome-explainer-card tone-${tone}`}>
      <div className="welcome-explainer-icon-wrap">
        <span className="welcome-explainer-num">{num}</span>
        <div className="welcome-explainer-icon">{icon}</div>
      </div>
      <div className="welcome-explainer-label">{label}</div>
      <h3 className="welcome-explainer-title">{title}</h3>
      <p className="welcome-explainer-blurb">{blurb}</p>
    </article>
  );
}

function BrandMark({ size = 28 }: { size?: number }) {
  // Stylized aperture / film-reel mark.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="foley-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5b94a" />
          <stop offset="100%" stopColor="#e08c2e" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#foley-mark-bg)" />
      <circle cx="16" cy="16" r="7" fill="#1d1d1f" opacity="0.9" />
      <circle cx="16" cy="16" r="3" fill="#fdf3d8" />
      <circle cx="16" cy="6.5" r="1.7" fill="#fdf3d8" opacity="0.85" />
      <circle cx="16" cy="25.5" r="1.7" fill="#fdf3d8" opacity="0.85" />
      <circle cx="6.5" cy="16" r="1.7" fill="#fdf3d8" opacity="0.85" />
      <circle cx="25.5" cy="16" r="1.7" fill="#fdf3d8" opacity="0.85" />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true" fill="currentColor">
      <path d="M11.6 10.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.8-1.6 0-3 .9-3.8 2.4-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7 1.4 0 1.8.7 3.1.7 1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.7 0-.1-2.5-1-2.5-3.8zM9.4 4c.6-.8 1-1.9.9-3-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.6-1.3z" />
    </svg>
  );
}

function ChromeGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M21 12H12" />
      <path d="M12 12L7.6 19.6" />
      <path d="M12 12L7.6 4.4" />
    </svg>
  );
}

function GithubGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function RepoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5z" />
      <path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" />
      <path d="M9 7h7M9 10h5" />
    </svg>
  );
}

function CaptureIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="14" height="12" rx="2" />
      <path d="M16.5 10.5 22 8v8l-5.5-2.5z" />
      <circle cx="9.5" cy="12" r="2.5" />
    </svg>
  );
}

function CutIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <path d="M8.1 8.4 21 17M8.1 15.6 21 7" />
    </svg>
  );
}

function MaintainIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3.5-7.1" />
      <path d="M21 4v5h-5" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function LaptopMockup() {
  return (
    <div className="laptop-mockup">
      <div className="laptop-screen">
        <div className="laptop-screen-bezel" />
        <video
          className="laptop-video"
          src="/walkthroughs/v1/takes/master/master.mp4"
          poster="/walkthroughs/v1/steps/intro.png"
          autoPlay
          loop
          muted
          playsInline
        />
        <div className="laptop-screen-glare" />
      </div>
      <div className="laptop-base">
        <div className="laptop-notch" />
      </div>
    </div>
  );
}
