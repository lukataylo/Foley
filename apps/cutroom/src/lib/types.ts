// Mirrors services/director/src/director/models.py.
// Hand-maintained — six models, not worth a codegen toolchain for the hackathon.

export type StepStatus = "unchanged" | "changed" | "added" | "removed";

export type ActionKind =
  | "goto"
  | "click"
  | "fill"
  | "hover"
  | "wait"
  | "scroll"
  | "press";

export interface Action {
  kind: ActionKind;
  selector?: string;
  value?: string;
  url?: string;
  ms?: number;
}

export interface Step {
  id: string;
  title: string;
  narration: string;
  actions: Action[];
  duration_ms: number;
  viewport: { width: number; height: number };
  artifact_hash?: string;
}

export interface BrandConfig {
  voice_id: string;
  voice_name: string;
  font_family: string;
  palette: { bg: string; fg: string; accent: string };
  pacing_wpm: number;
  intro_card_ms: number;
}

export interface Walkthrough {
  id: string;
  version: number;
  target_app: { repo: string; dev_url: string };
  brand: BrandConfig;
  steps: Step[];
}

export interface StepDiff {
  step_id: string;
  status: StepStatus;
  reason: string;
  proposed_step?: Step;
}

export interface Take {
  id: string;
  walkthrough_id: string;
  parent_take_id: string | null;
  pr_number: number | null;
  created_at: string;
  status: "drafting" | "ready" | "approved" | "rejected";
  step_diffs: StepDiff[];
  master_path: string;
}
