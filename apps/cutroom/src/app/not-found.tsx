// Custom 404. Rendered for any non-matched route under the Foley dashboard.
// Mintlify-parity: branded not-found page that points at the home grid +
// the onboarding flow rather than dumping the user out of the funnel.

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <div className="not-found-inner">
        <div className="not-found-mark">404</div>
        <h1>Cut.</h1>
        <p>
          That page isn&apos;t in the cutroom. Either the walkthrough was
          renamed, the take was rejected, or the URL is a typo.
        </p>
        <div className="not-found-cta-row">
          <Link href="/" className="not-found-cta">
            ← Back to walkthroughs
          </Link>
          <Link href="/onboard" className="not-found-cta not-found-cta-ghost">
            Onboard a project
          </Link>
        </div>
      </div>
    </main>
  );
}
