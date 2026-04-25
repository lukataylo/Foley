// Atomic file writes for the cutroom.
//
// All JSON / YAML / status writes go through these helpers so a process crash
// mid-write can never leave a half-written file on disk for the next reader to
// trip over. The pattern: write to a sibling tempfile, then rename — `rename`
// is atomic on POSIX when source and destination are on the same filesystem.

import "server-only";
import { promises as fs } from "fs";
import path from "path";

async function writeAtomic(
  filePath: string,
  data: string | Buffer,
  options: { encoding?: BufferEncoding } = {},
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  // Tempfile lives in the same directory so rename is on the same filesystem.
  const base = path.basename(filePath);
  const tmp = path.join(
    dir,
    `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`,
  );
  try {
    if (typeof data === "string") {
      await fs.writeFile(tmp, data, options.encoding ?? "utf8");
    } else {
      await fs.writeFile(tmp, data);
    }
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup of the tempfile on failure.
    try {
      await fs.unlink(tmp);
    } catch {
      // ignore
    }
    throw err;
  }
}

/** Atomically write a string to `filePath`. UTF-8 by default. */
export async function writeFileAtomic(
  filePath: string,
  text: string,
  encoding: BufferEncoding = "utf8",
): Promise<void> {
  await writeAtomic(filePath, text, { encoding });
}

/** Atomically write bytes to `filePath`. */
export async function writeBytesAtomic(
  filePath: string,
  data: Buffer,
): Promise<void> {
  await writeAtomic(filePath, data);
}

/** Atomically write a JSON-serializable object. Defaults to indent=2 to match
 * the manifest/take.json formatting used everywhere else in the repo. */
export async function writeJsonAtomic(
  filePath: string,
  obj: unknown,
  options: { indent?: number } = {},
): Promise<void> {
  const indent = options.indent ?? 2;
  await writeFileAtomic(filePath, JSON.stringify(obj, null, indent));
}
