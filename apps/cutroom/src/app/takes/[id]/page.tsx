// Timeline editor — Cerbro-style surface.
// Server loads take + walkthrough + manifest + per-step waveforms, then
// hands everything to <EditorShell/> (client) for the interactive surface.

import { notFound } from "next/navigation";
import {
  loadManifest,
  loadStepWaveform,
  loadTake,
  loadWalkthrough,
  publicPath,
  takePublicPath,
} from "@/lib/fs";
import { EditorShell } from "./EditorShell";
import type { Step } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TakePage({ params }: { params: { id: string } }) {
  let take, manifest, walkthrough;
  try {
    take = await loadTake("v1", params.id);
    manifest = await loadManifest("v1", params.id);
    walkthrough = await loadWalkthrough("v1");
  } catch {
    notFound();
  }

  // Reconstruct the effective Step list for THIS take by replacing CHANGED
  // step entries with their proposed_step and inserting ADDED ones at the end.
  const stepById = new Map(walkthrough.steps.map((s) => [s.id, s]));
  for (const d of take.step_diffs) {
    if (d.proposed_step && (d.status === "changed" || d.status === "added")) {
      stepById.set(d.step_id, d.proposed_step as Step);
    }
  }
  const stepIds = take.step_diffs.map((d) => d.step_id);
  const steps: Step[] = stepIds
    .map((id) => stepById.get(id))
    .filter((s): s is Step => Boolean(s));

  const waveforms = await Promise.all(
    steps.map(async (s) => ({ id: s.id, wf: await loadStepWaveform("v1", s.id) })),
  );

  const segmentsByStep = Object.fromEntries(
    manifest.segments.map((s) => [s.step_id, s]),
  );
  const stepDiffsByStep = Object.fromEntries(
    take.step_diffs.map((d) => [d.step_id, d]),
  );

  const trackData = steps.map((s) => ({
    id: s.id,
    title: s.title,
    narration: s.narration,
    duration_ms: s.duration_ms,
    diff_status: stepDiffsByStep[s.id]?.status ?? "unchanged",
    diff_reason: stepDiffsByStep[s.id]?.reason ?? "",
    frame_url: publicPath("v1", "steps", `${s.id}.png`),
    waveform: waveforms.find((w) => w.id === s.id)?.wf ?? null,
    segment_sha256: segmentsByStep[s.id]?.segment_sha256 ?? null,
  }));

  // Friendly title for the back-link. Matches the home's TITLECASE map.
  const displayName = walkthrough.id === "v1" ? "Loop" : walkthrough.id.replace(/[-_]/g, " ");

  return (
    <EditorShell
      takeId={params.id}
      walkthroughDisplayName={displayName}
      take={take}
      walkthrough={walkthrough}
      tracks={trackData}
      masterUrl={takePublicPath(walkthrough.id, params.id, "master.mp4")}
    />
  );
}
