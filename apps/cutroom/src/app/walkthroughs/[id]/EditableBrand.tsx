"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandConfig } from "@/lib/types";

interface Props {
  walkthroughId: string;
  brand: BrandConfig;
}

const VOICE_PRESETS: { id: string; name: string }[] = [
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian" },
];

const FONT_PRESETS = [
  "SF Pro Text",
  "SF Pro Display",
  '"New York"',
  "Inter",
  "Helvetica Neue",
  "ui-monospace",
];

export function EditableBrand({ walkthroughId, brand }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<BrandConfig>(brand);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cloneStatus, setCloneStatus] = useState<"idle" | "uploading" | "ok" | "error">("idle");
  const [cloneMessage, setCloneMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function patch(p: Partial<BrandConfig>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function save() {
    setBusy(true);
    try {
      // Sync the voice_id when the name changes via preset.
      const preset = VOICE_PRESETS.find((v) => v.name === draft.voice_name);
      const body = preset ? { ...draft, voice_id: preset.id } : draft;
      await fetch(`/api/walkthroughs/${walkthroughId}/brand`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setDraft(brand);
    setEditing(false);
  }

  async function uploadVoiceSample(file: File) {
    setCloneStatus("uploading");
    setCloneMessage(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch(`/api/walkthroughs/${walkthroughId}/brand/voice`, {
        method: "POST",
        body: fd,
      });
      const data = (await r.json()) as {
        ok: boolean;
        voice_id?: string;
        voice_name?: string;
        message?: string;
      };
      if (!r.ok || !data.ok) {
        setCloneStatus("error");
        setCloneMessage(data.message ?? `HTTP ${r.status}`);
        return;
      }
      setCloneStatus("ok");
      setCloneMessage(`Cloned as "${data.voice_name}"`);
      router.refresh();
    } catch (err) {
      setCloneStatus("error");
      setCloneMessage(err instanceof Error ? err.message : "network error");
    }
  }

  return (
    <div className="sticky sticky-mint">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <h2 style={{ margin: 0, display: "inline-flex", alignItems: "center" }}>
          Brand <Sparkle />
        </h2>
        {editing ? (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={cancel}
              className="brand-edit-btn"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="brand-edit-btn brand-edit-primary"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="brand-edit-btn"
            onClick={() => setEditing(true)}
            style={{ marginLeft: "auto" }}
          >
            Edit
          </button>
        )}
      </div>

      <div className="row">
        <span className="k">Voice</span>
        {editing ? (
          <select
            className="brand-input"
            value={draft.voice_name}
            onChange={(e) => patch({ voice_name: e.target.value })}
          >
            {VOICE_PRESETS.map((v) => (
              <option key={v.id} value={v.name}>{v.name}</option>
            ))}
          </select>
        ) : (
          <span className="v">{brand.voice_name} · en-GB</span>
        )}
      </div>

      <div className="row">
        <span className="k">Pacing</span>
        {editing ? (
          <input
            type="number"
            min={120}
            max={220}
            className="brand-input"
            value={draft.pacing_wpm}
            onChange={(e) => patch({ pacing_wpm: Number(e.target.value) })}
            style={{ width: 90, textAlign: "right" }}
          />
        ) : (
          <span className="v">{brand.pacing_wpm} wpm</span>
        )}
      </div>

      <div className="row">
        <span className="k">Intro card</span>
        {editing ? (
          <input
            type="number"
            min={0}
            max={6000}
            step={100}
            className="brand-input"
            value={draft.intro_card_ms}
            onChange={(e) => patch({ intro_card_ms: Number(e.target.value) })}
            style={{ width: 100, textAlign: "right" }}
          />
        ) : (
          <span className="v">{(brand.intro_card_ms / 1000).toFixed(1)}s</span>
        )}
      </div>

      <div className="row">
        <span className="k">Font</span>
        {editing ? (
          <select
            className="brand-input"
            value={draft.font_family}
            onChange={(e) => patch({ font_family: e.target.value })}
          >
            {FONT_PRESETS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        ) : (
          <span className="v">{brand.font_family}</span>
        )}
      </div>

      <div className="row">
        <span className="k">Palette</span>
        {editing ? (
          <span className="palette-dots">
            <PaletteSwatch value={draft.palette_bg} onChange={(v) => patch({ palette_bg: v })} />
            <PaletteSwatch value={draft.palette_fg} onChange={(v) => patch({ palette_fg: v })} />
            <PaletteSwatch value={draft.palette_accent} onChange={(v) => patch({ palette_accent: v })} />
          </span>
        ) : (
          <span className="palette-dots">
            <span style={{ background: brand.palette_bg }} />
            <span style={{ background: brand.palette_fg }} />
            <span style={{ background: brand.palette_accent }} />
          </span>
        )}
      </div>

      <div className="voice-locked">
        🔒 voice locked at the walkthrough level
      </div>

      <div className="brand-clone">
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/m4a,audio/x-m4a,audio/mp4,audio/wav,audio/wave,audio/x-wav,audio/webm"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadVoiceSample(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="brand-clone-btn"
          disabled={cloneStatus === "uploading"}
          onClick={() => fileRef.current?.click()}
        >
          {cloneStatus === "uploading" ? "Cloning…" : "🎙 Clone my voice"}
        </button>
        {cloneStatus === "ok" && cloneMessage ? (
          <span className="brand-clone-ok">✓ {cloneMessage}</span>
        ) : null}
        {cloneStatus === "error" && cloneMessage ? (
          <span className="brand-clone-err">{cloneMessage}</span>
        ) : null}
        {cloneStatus === "idle" ? (
          <span className="brand-clone-hint">
            Drop a 30 s – 2 min clean recording — ElevenLabs Instant Voice Cloning.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PaletteSwatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span style={{ position: "relative", width: 18, height: 18 }}>
      <span
        style={{
          background: value,
          width: 18,
          height: 18,
          borderRadius: 999,
          display: "block",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
        }}
      />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          cursor: "pointer",
        }}
      />
    </span>
  );
}

function Sparkle() {
  return (
    <svg className="sparkle" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z" fill="currentColor" />
    </svg>
  );
}
