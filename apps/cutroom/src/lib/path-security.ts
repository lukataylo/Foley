import "server-only";
import path from "path";

export function containedPath(root: string, ...parts: string[]): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...parts);
  const relative = path.relative(resolvedRoot, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return target;
  }
  throw new Error(`path escapes root: ${parts.join("/")}`);
}

export function publicAssetPath(repoRoot: string, assetUrl: string): string | null {
  if (!assetUrl.startsWith("/walkthroughs/")) return null;
  const rawPath = assetUrl.split("?")[0];
  const parts = rawPath.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return null;
  return containedPath(repoRoot, ...parts);
}
