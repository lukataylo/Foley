import "server-only";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

interface StepBody {
  id: string;
  title?: string;
  narration?: string;
  duration_ms?: number;
}

type AddBody = { op: "add"; step: StepBody; after?: string | null };
type RenameBody = { op: "rename"; id: string; new_id?: string; title?: string; narration?: string; duration_ms?: number };
type RemoveBody = { op: "remove"; id: string };
type ReorderBody = { op: "reorder"; order: string[] };

type Body = AddBody | RenameBody | RemoveBody | ReorderBody;

interface YamlStep {
  id: string;
  title?: string;
  narration?: string;
  duration_ms?: number;
  actions?: unknown[];
}
interface YamlWalkthrough {
  steps: YamlStep[];
  [k: string]: unknown;
}

function pathFor(id: string): string {
  return path.join(REPO_ROOT, "walkthroughs", id, "walkthrough.yaml");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object" || !("op" in body)) {
    return NextResponse.json({ error: "op required" }, { status: 400 });
  }

  const file = pathFor(params.id);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return NextResponse.json({ error: "walkthrough.yaml missing" }, { status: 404 });
  }
  const parsed = yaml.load(raw) as YamlWalkthrough;
  parsed.steps = parsed.steps ?? [];

  if (body.op === "add") {
    const exists = parsed.steps.some((s) => s.id === body.step.id);
    if (exists) {
      return NextResponse.json({ error: `step ${body.step.id} already exists` }, { status: 409 });
    }
    const newStep: YamlStep = {
      id: body.step.id,
      title: body.step.title ?? body.step.id,
      narration: body.step.narration ?? `Add narration for ${body.step.id}.`,
      duration_ms: body.step.duration_ms ?? 5000,
      actions: [{ kind: "wait", ms: body.step.duration_ms ?? 5000 }],
    };
    if (body.after) {
      const idx = parsed.steps.findIndex((s) => s.id === body.after);
      if (idx >= 0) parsed.steps.splice(idx + 1, 0, newStep);
      else parsed.steps.push(newStep);
    } else {
      parsed.steps.push(newStep);
    }
  } else if (body.op === "rename") {
    const s = parsed.steps.find((x) => x.id === body.id);
    if (!s) return NextResponse.json({ error: `step ${body.id} not found` }, { status: 404 });
    if (body.new_id && body.new_id !== body.id) {
      if (parsed.steps.some((x) => x.id === body.new_id)) {
        return NextResponse.json({ error: `step ${body.new_id} already exists` }, { status: 409 });
      }
      s.id = body.new_id;
    }
    if (body.title !== undefined) s.title = body.title;
    if (body.narration !== undefined) s.narration = body.narration;
    if (body.duration_ms !== undefined) s.duration_ms = body.duration_ms;
  } else if (body.op === "remove") {
    parsed.steps = parsed.steps.filter((s) => s.id !== body.id);
  } else if (body.op === "reorder") {
    const order = body.order;
    const byId = new Map(parsed.steps.map((s) => [s.id, s]));
    const next: YamlStep[] = [];
    for (const id of order) {
      const s = byId.get(id);
      if (s) next.push(s);
    }
    // Append any steps that weren't named in the order, preserving position.
    for (const s of parsed.steps) if (!order.includes(s.id)) next.push(s);
    parsed.steps = next;
  } else {
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }

  await writeFile(file, yaml.dump(parsed, { lineWidth: 100 }), "utf8");
  return NextResponse.json({ ok: true, steps: parsed.steps.map((s) => s.id) });
}
