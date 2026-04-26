// Resolve a pasted GitHub URL into a RepoSummary. Server-side so we can
// optionally attach a GITHUB_TOKEN (lifts the public 60-req/hr rate limit
// and gives access to private repos). Falls back gracefully when the API
// call fails — the user can still continue with parsed-only values.
//
// Replaces the old /api/github/repos repo-list flow in onboarding: the
// user pastes a URL instead of picking from a (mostly fake) list.

import "server-only";
import { NextResponse } from "next/server";
import { parseGithubUrl } from "@/lib/github-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RepoSummary {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  private: boolean;
  owner_avatar: string | null;
  default_branch: string;
}

interface GithubRepoApi {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  private: boolean;
  owner?: { avatar_url?: string };
  default_branch: string;
}

function fallbackRepo(full_name: string, name: string): RepoSummary {
  return {
    id: 0,
    name,
    full_name,
    description: null,
    language: null,
    stargazers_count: 0,
    pushed_at: new Date().toISOString(),
    private: false,
    owner_avatar: null,
    default_branch: "main",
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "url required" },
      { status: 400 },
    );
  }
  const parsed = parseGithubUrl(url);
  if (!parsed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "couldn't read a GitHub repo from that URL — try `https://github.com/owner/repo` or `owner/repo`",
      },
      { status: 400 },
    );
  }

  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "foley-onboard",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      { headers, signal: AbortSignal.timeout(5_000) },
    );
    if (res.status === 200) {
      const j = (await res.json()) as GithubRepoApi;
      const repo: RepoSummary = {
        id: j.id,
        name: j.name,
        full_name: j.full_name,
        description: j.description,
        language: j.language,
        stargazers_count: j.stargazers_count,
        pushed_at: j.pushed_at,
        private: j.private,
        owner_avatar: j.owner?.avatar_url ?? null,
        default_branch: j.default_branch,
      };
      return NextResponse.json({ ok: true, repo });
    }
    if (res.status === 404) {
      return NextResponse.json({
        ok: true,
        fallback: true,
        repo: fallbackRepo(parsed.full_name, parsed.repo),
        warning:
          "GitHub returned 404 — repo may be private or the URL is wrong. Continuing with bare metadata.",
      });
    }
    if (res.status === 403) {
      return NextResponse.json({
        ok: true,
        fallback: true,
        repo: fallbackRepo(parsed.full_name, parsed.repo),
        warning:
          "GitHub rate-limited the lookup. Set GITHUB_TOKEN in /welcome#keys to lift the cap; continuing with bare metadata for now.",
      });
    }
    return NextResponse.json({
      ok: true,
      fallback: true,
      repo: fallbackRepo(parsed.full_name, parsed.repo),
      warning: `GitHub responded ${res.status}; continuing with bare metadata.`,
    });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      fallback: true,
      repo: fallbackRepo(parsed.full_name, parsed.repo),
      warning: `Couldn't reach api.github.com (${
        err instanceof Error ? err.message : "network error"
      }) — continuing with bare metadata.`,
    });
  }
}
