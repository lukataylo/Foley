// Step-by-step editor for a captured walkthrough. Server loads the YAML and
// hands the raw step data (including action breakdowns) to the client editor.

import Link from "next/link";
import { notFound } from "next/navigation";
import path from "path";
import { readFile } from "fs/promises";
import yaml from "js-yaml";
import { ThemeToggle } from "@/components/ThemeToggle";
import { stepFramePath } from "@/lib/fs";
import { isValidWalkthroughId } from "@/lib/ids";
import { EditorClient, type ClientStep } from "./EditorClient";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

interface RawAction {
  kind?: string;
  selector?: string;
  url?: string;
  value?: string;
  ms?: number;
}

interface RawStep {
  id: string;
  title?: string;
  narration?: string;
  duration_ms?: number;
  viewport?: { width: number; height: number };
  actions?: RawAction[];
}

interface RawWalkthrough {
  version?: number;
  display_name?: string;
  target_app?: { repo?: string; dev_url?: string };
  steps?: RawStep[];
}

export default async function EditWalkthroughPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isValidWalkthroughId(params.id)) notFound();

  let raw: RawWalkthrough = {};
  let loadError: string | null = null;
  const file = path.join(WALKTHROUGHS_DIR, params.id, "walkthrough.yaml");
  try {
    raw = (yaml.load(await readFile(file, "utf8")) ?? {}) as RawWalkthrough;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      notFound();
    }
    // Bad YAML — keep the editor visible with a banner rather than 404'ing.
    loadError =
      err instanceof Error
        ? `walkthrough.yaml has invalid YAML syntax: ${err.message.split("\n")[0]}`
        : "walkthrough.yaml could not be loaded.";
  }

  // Best-effort: pull per-step capture warnings + errors out of meta.json so
  // the editor can show "this step had selector misses" or "retake failed"
  // badges without re-running anything.
  const stepsRaw = raw.steps ?? [];
  const metas = await Promise.all(
    stepsRaw.map(async (s) => {
      try {
        const metaPath = path.join(
          WALKTHROUGHS_DIR,
          params.id,
          "steps",
          `${s.id}.meta.json`,
        );
        const txt = await readFile(metaPath, "utf8");
        const m = JSON.parse(txt) as {
          error?: string;
          action_warnings?: Array<{ index: number; kind: string; message: string }>;
        };
        return {
          captureError: m.error ?? null,
          captureWarnings: m.action_warnings ?? [],
        };
      } catch {
        return { captureError: null, captureWarnings: [] };
      }
    }),
  );

  const steps: ClientStep[] = stepsRaw.map((s, i) => {
    const actions = s.actions ?? [];
    const interaction = actions.find(
      (a) => a.kind === "click" || a.kind === "fill" || a.kind === "hover",
    );
    const goto = actions.find((a) => a.kind === "goto");
    return {
      id: s.id,
      title: s.title ?? "Untitled step",
      narration: s.narration ?? "",
      duration_ms: s.duration_ms ?? 4000,
      url: goto?.url ?? null,
      interaction: interaction
        ? {
            kind: interaction.kind ?? "click",
            selector: interaction.selector ?? null,
            value: interaction.value ?? null,
          }
        : null,
      actions: actions.map((a) => ({
        kind: a.kind ?? "?",
        selector: a.selector ?? null,
        url: a.url ?? null,
        value: a.value ?? null,
        ms: typeof a.ms === "number" ? a.ms : null,
      })),
      screenshotUrl: stepFramePath(params.id, s.id),
      captureError: metas[i]?.captureError ?? null,
      captureWarnings: metas[i]?.captureWarnings ?? [],
    };
  });

  return (
    <main className="editor-page">
      <div className="editor-inner">
        <header className="editor-header">
          <div>
            <Link href="/" className="detail-back">← Walkthroughs</Link>
            <p className="detail-eyebrow" style={{ marginTop: 12 }}>
              Edit · {steps.length} step{steps.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="actions">
            <ThemeToggle />
            <Link className="btn-secondary" href={`/walkthroughs/${params.id}`}>
              Walkthrough page
            </Link>
          </div>
        </header>

        <EditorClient
          walkthroughId={params.id}
          initialDisplayName={raw.display_name ?? params.id}
          devUrl={raw.target_app?.dev_url ?? ""}
          initialSteps={steps}
          loadError={loadError}
        />
      </div>
    </main>
  );
}
