import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cutroom — Foley",
  description: "Review and approve walkthrough takes.",
};

// Inline pre-hydration script: read the saved theme from localStorage and set
// the data-theme attribute *before* React renders, so we never flash the
// wrong palette. Default is light.
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem('foley-theme');
    if (t !== 'light' && t !== 'dark') t = 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
