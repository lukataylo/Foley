import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

interface MasterBackup {
  id: string;          // takes/<id>
  ts: string;          // best-effort ISO timestamp from the directory name
  promoted_from: string | null;
  master_sha256: string | null;
  size_bytes: number | null;
}

/** List the master.prev-<ts>/ backups so the UI can offer "restore". */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const wtDir = path.join(REPO_ROOT, "walkthroughs", params.id, "takes");
  let entries;
  try {
    entries = await fs.readdir(wtDir, { withFileTypes: true });
  } catch {
    return NextResponse.json({ backups: [] });
  }

  const out: MasterBackup[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (!e.name.startsWith("master.prev-")) continue;
    const dirPath = path.join(wtDir, e.name);
    let promoted_from: string | null = null;
    let master_sha256: string | null = null;
    let size_bytes: number | null = null;
    try {
      const tj = await fs.readFile(path.join(dirPath, "take.json"), "utf8");
      const take = JSON.parse(tj);
      promoted_from = take.promoted_from ?? null;
    } catch { /* ignore */ }
    try {
      const mj = await fs.readFile(path.join(dirPath, "manifest.json"), "utf8");
      const manifest = JSON.parse(mj);
      master_sha256 = manifest.master_sha256 ?? null;
    } catch { /* ignore */ }
    try {
      const s = await fs.stat(path.join(dirPath, "master.mp4"));
      size_bytes = s.size;
    } catch { /* ignore */ }
    const ts = e.name.replace(/^master\.prev-/, "");
    out.push({ id: e.name, ts, promoted_from, master_sha256, size_bytes });
  }
  // Newest first.
  out.sort((a, b) => (b.ts > a.ts ? 1 : -1));
  return NextResponse.json({ backups: out });
}
