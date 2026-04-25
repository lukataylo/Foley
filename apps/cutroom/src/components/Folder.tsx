// Folder icon — classic macOS-Finder shape (tab + body) with content cards
// peeking out the top of the front face. Tinted via per-tone palettes.

type Tone = "blue" | "amber" | "graphite" | "mint" | "violet" | "rose";

interface FolderProps {
  /** Up to 3 thumbnails painted as the cards peeking out of the folder. */
  thumbs?: string[];
  /** Wordmark on the front face (lower-left). */
  mark?: string;
  /** Big symbol overlaid on the front face (used by the "+ New" tile). */
  glyph?: string;
  tone?: Tone;
  variant?: "default" | "muted";
  className?: string;
}

interface Palette {
  back: string;        // back-of-folder + tab
  back2: string;       // gradient end on the back
  front: string;       // front face base
  front2: string;      // gradient highlight on front face
  rim: string;         // top edge of the front face (lighter line)
  shadow: string;      // dropped underneath
  markFill: string;
}

const TONES: Record<Tone, Palette> = {
  blue: {
    back: "#3a7fde", back2: "#2964c2",
    front: "#5fa1f0", front2: "#8bbcf6",
    rim: "rgba(255,255,255,0.55)",
    shadow: "0 14px 28px rgba(50,90,170,0.30), 0 2px 6px rgba(0,0,0,0.06)",
    markFill: "rgba(255,255,255,0.92)",
  },
  amber: {
    back: "#d99213", back2: "#b07208",
    front: "#f5b740", front2: "#ffd070",
    rim: "rgba(255,255,255,0.6)",
    shadow: "0 14px 28px rgba(190,130,20,0.30), 0 2px 6px rgba(0,0,0,0.06)",
    markFill: "rgba(45,30,0,0.85)",
  },
  graphite: {
    back: "#26262a", back2: "#16161a",
    front: "#3a3a40", front2: "#54545c",
    rim: "rgba(255,255,255,0.18)",
    shadow: "0 14px 28px rgba(0,0,0,0.40), 0 2px 6px rgba(0,0,0,0.20)",
    markFill: "rgba(255,255,255,0.92)",
  },
  mint: {
    back: "#229a64", back2: "#187a4d",
    front: "#3fc88c", front2: "#74dca7",
    rim: "rgba(255,255,255,0.55)",
    shadow: "0 14px 28px rgba(30,140,90,0.30), 0 2px 6px rgba(0,0,0,0.06)",
    markFill: "rgba(255,255,255,0.92)",
  },
  violet: {
    back: "#7757d6", back2: "#5e3eb8",
    front: "#9b7bf3", front2: "#b69bf7",
    rim: "rgba(255,255,255,0.55)",
    shadow: "0 14px 28px rgba(110,80,200,0.30), 0 2px 6px rgba(0,0,0,0.06)",
    markFill: "rgba(255,255,255,0.92)",
  },
  rose: {
    back: "#d65a6f", back2: "#b04256",
    front: "#f08394", front2: "#f5a3b0",
    rim: "rgba(255,255,255,0.55)",
    shadow: "0 14px 28px rgba(190,80,110,0.30), 0 2px 6px rgba(0,0,0,0.06)",
    markFill: "rgba(255,255,255,0.92)",
  },
};

export function Folder({
  thumbs = [],
  mark = "f—",
  glyph,
  tone = "blue",
  variant = "default",
  className,
}: FolderProps) {
  const opacity = variant === "muted" ? 0.78 : 1;
  const palette = TONES[tone];

  // Three cards stacked behind the front face, slightly fanned and
  // peeking out the top of the body. Center card is largest.
  const cards = [
    { x: 30, y: 56,  w: 90,  h: 76, rot: -7, thumb: thumbs[2] ?? null, fallback: "#a78bfa" },
    { x: 78, y: 50,  w: 96,  h: 80, rot:  6, thumb: thumbs[1] ?? null, fallback: "#fde68a" },
    { x: 54, y: 44,  w: 96,  h: 84, rot: -1, thumb: thumbs[0] ?? null, fallback: "#fff" },
  ];

  return (
    <svg
      className={`folder-art ${className ?? ""}`}
      viewBox="0 0 200 180"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Folder"
      style={{ opacity, filter: `drop-shadow(${palette.shadow})` }}
    >
      <defs>
        <linearGradient id="back-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.back} />
          <stop offset="1" stopColor={palette.back2} />
        </linearGradient>
        <linearGradient id="front-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.front2} />
          <stop offset="0.5" stopColor={palette.front} />
          <stop offset="1" stopColor={palette.back} />
        </linearGradient>
        <linearGradient id="front-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* Mask so cards only show ABOVE the front face — they're tucked behind the body. */}
        <clipPath id="cards-clip">
          <rect x="0" y="0" width="200" height="84" />
        </clipPath>
      </defs>

      {/* Back panel + tab — generous matching radii top and bottom. */}
      <path
        d="
          M 14 40
          Q 14 26, 28 26
          H 74
          Q 80 26, 84 30
          L 92 38
          Q 96 42, 102 42
          H 172
          Q 186 42, 186 56
          V 152
          Q 186 166, 172 166
          H 28
          Q 14 166, 14 152
          Z
        "
        fill="url(#back-grad)"
      />

      {/* Tab top edge highlight */}
      <path
        d="M 28 28 H 74 Q 80 28, 84 32 L 92 40 Q 96 44, 102 44 H 172"
        stroke={palette.rim}
        strokeWidth="0.9"
        fill="none"
      />

      {/* Cards peeking out, clipped to top half so they tuck behind the front */}
      <g clipPath="url(#cards-clip)">
        {cards.map((c, i) => (
          <g
            key={i}
            transform={`rotate(${c.rot} ${c.x + c.w / 2} ${c.y + c.h / 2})`}
          >
            <rect
              x={c.x} y={c.y}
              width={c.w} height={c.h}
              rx="6"
              fill="#fff"
              stroke="rgba(0,0,0,0.08)"
              strokeWidth="0.5"
            />
            {c.thumb ? (
              <image
                href={c.thumb}
                x={c.x + 3} y={c.y + 3}
                width={c.w - 6} height={c.h - 6}
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              <>
                <rect
                  x={c.x + 6} y={c.y + 6}
                  width={c.w - 12} height={c.h - 18}
                  rx="3"
                  fill={c.fallback}
                  opacity="0.6"
                />
                <rect
                  x={c.x + 10} y={c.y + c.h - 10}
                  width={c.w - 20} height="2"
                  rx="1"
                  fill="rgba(0,0,0,0.18)"
                />
              </>
            )}
          </g>
        ))}
      </g>

      {/* Front face — radius matches the back so top + bottom feel paired. */}
      <rect
        x="14" y="74"
        width="172" height="92"
        rx="14"
        fill="url(#front-grad)"
      />

      {/* Top rim of the front face — pulls the eye to the lip. */}
      <path
        d="M 22 75 Q 28 75, 32 75 H 168 Q 178 75, 178 75"
        stroke={palette.rim}
        strokeWidth="1"
        fill="none"
      />

      {/* Specular shine across the upper third of the front face */}
      <rect
        x="14" y="74"
        width="172" height="36"
        rx="14"
        fill="url(#front-shine)"
      />

      {/* Big glyph (used by "+ New") */}
      {glyph ? (
        <text
          x="100" y="138"
          textAnchor="middle"
          fontSize="44"
          fontWeight="300"
          fill={palette.markFill}
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        >
          {glyph}
        </text>
      ) : null}

      {/* Lower-left wordmark */}
      {mark && !glyph ? (
        <text
          x="22" y="156"
          fontSize="13"
          fill={palette.markFill}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontWeight="500"
          letterSpacing="0.04em"
        >
          {mark}
        </text>
      ) : null}
    </svg>
  );
}
