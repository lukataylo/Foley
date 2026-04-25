// Skeuomorphic folder, 200×156 viewBox, drives off the --folder-* CSS vars
// so it adapts to light / dark themes.

interface FolderProps {
  label?: string;        // small subtitle inside the front face
  caption?: string;      // mono caption rendered on the front face
  emoji?: string;        // optional decorative glyph (e.g. 📄)
  variant?: "default" | "muted"; // muted = placeholder/sample
  className?: string;
}

export function Folder({ label, caption, emoji, variant = "default", className }: FolderProps) {
  const opacity = variant === "muted" ? 0.55 : 1;
  return (
    <svg
      className={`folder-art ${className ?? ""}`}
      viewBox="0 0 200 156"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label ?? "Folder"}
      style={{ opacity, filter: "drop-shadow(var(--folder-shadow))" }}
    >
      <defs>
        <linearGradient id="folder-back-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--folder-back)" />
          <stop offset="1" stopColor="var(--folder-front)" />
        </linearGradient>
        <linearGradient id="folder-front-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--folder-front-2)" />
          <stop offset="0.6" stopColor="var(--folder-front)" />
          <stop offset="1" stopColor="var(--folder-back)" />
        </linearGradient>
        <linearGradient id="folder-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--folder-shine)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--folder-shine)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Back panel — taller so the tab sits above the front face */}
      <path
        d="M14 30 q0 -10 10 -10 h54 q4 0 7 3 l8 7 q3 3 7 3 h78 q10 0 10 10 v94 q0 10 -10 10 H24 q-10 0 -10 -10 z"
        fill="url(#folder-back-grad)"
      />

      {/* Tab highlight — subtle inside curve */}
      <path
        d="M84 22 l8 7 q3 3 7 3 h70 q4 0 7 1"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="0.8"
        fill="none"
      />

      {/* Front face — shifted slightly down to expose the tab */}
      <rect
        x="14" y="48"
        width="172" height="92"
        rx="10"
        fill="url(#folder-front-grad)"
      />

      {/* Top shine on the front face */}
      <rect
        x="14" y="48"
        width="172" height="34"
        rx="10"
        fill="url(#folder-shine)"
      />

      {/* Inner top-edge line for definition */}
      <line
        x1="20" y1="49"
        x2="180" y2="49"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1"
      />

      {/* Optional caption inside the folder face */}
      {caption ? (
        <text
          x="100"
          y="86"
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="10.5"
          fill="rgba(255,255,255,0.85)"
          letterSpacing="0.06em"
        >
          {caption.toUpperCase()}
        </text>
      ) : null}

      {label ? (
        <text
          x="100"
          y="108"
          textAnchor="middle"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
          fontSize="18"
          fontWeight="600"
          fill="#fff"
          letterSpacing="-0.02em"
        >
          {label}
        </text>
      ) : null}

      {emoji ? (
        <text
          x="100"
          y="130"
          textAnchor="middle"
          fontSize="20"
        >
          {emoji}
        </text>
      ) : null}
    </svg>
  );
}
