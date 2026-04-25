// Cutroom — dailies list. Minimal stub; built out in Phase 6.

export default function CutroomPage() {
  return (
    <main style={{ padding: 32, maxWidth: 960, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Cutroom</h1>
        <span style={{ color: "var(--muted)" }}>Foley · v0</span>
      </header>
      <p style={{ color: "var(--muted)", marginTop: 24 }}>
        Dailies will land here.
      </p>
    </main>
  );
}
