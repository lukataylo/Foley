import { NextResponse } from "next/server";

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
  owner: { avatar_url: string };
  default_branch: string;
}

const MOCK: RepoSummary[] = [
  {
    id: 101, name: "loop", full_name: "yourname/loop",
    description: "A delightfully simple ticket tracker.",
    language: "TypeScript", stargazers_count: 412, pushed_at: "2026-04-25T09:14:00Z",
    private: false, owner_avatar: null, default_branch: "main",
  },
  {
    id: 102, name: "acme-cloud", full_name: "yourname/acme-cloud",
    description: "Cloud orchestration platform — internal demo.",
    language: "Go", stargazers_count: 87, pushed_at: "2026-04-22T16:20:00Z",
    private: true, owner_avatar: null, default_branch: "main",
  },
  {
    id: 103, name: "beam", full_name: "yourname/beam",
    description: "Lightweight data pipeline DSL.",
    language: "Python", stargazers_count: 1240, pushed_at: "2026-04-20T11:02:00Z",
    private: false, owner_avatar: null, default_branch: "main",
  },
  {
    id: 104, name: "foley", full_name: "yourname/foley",
    description: "Walkthroughs that maintain themselves.",
    language: "TypeScript", stargazers_count: 14, pushed_at: "2026-04-25T13:50:00Z",
    private: true, owner_avatar: null, default_branch: "main",
  },
  {
    id: 105, name: "harbor", full_name: "yourname/harbor",
    description: "Self-hosted container registry with audit trails.",
    language: "Rust", stargazers_count: 322, pushed_at: "2026-04-15T22:48:00Z",
    private: false, owner_avatar: null, default_branch: "main",
  },
  {
    id: 106, name: "field-notes", full_name: "yourname/field-notes",
    description: "Personal knowledge base, in markdown.",
    language: "TypeScript", stargazers_count: 24, pushed_at: "2026-04-12T08:08:00Z",
    private: true, owner_avatar: null, default_branch: "main",
  },
];

export async function GET(): Promise<NextResponse> {
  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return NextResponse.json({ source: "mock", repos: MOCK });
  }
  try {
    const res = await fetch(
      "https://api.github.com/user/repos?per_page=30&sort=pushed",
      {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "foley-onboard",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      return NextResponse.json({ source: "mock", repos: MOCK, note: `gh ${res.status}` });
    }
    const raw = (await res.json()) as GithubRepoApi[];
    const repos: RepoSummary[] = raw.map((r) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      language: r.language,
      stargazers_count: r.stargazers_count,
      pushed_at: r.pushed_at,
      private: r.private,
      owner_avatar: r.owner?.avatar_url ?? null,
      default_branch: r.default_branch ?? "main",
    }));
    return NextResponse.json({ source: "github", repos });
  } catch (e) {
    return NextResponse.json({
      source: "mock",
      repos: MOCK,
      note: e instanceof Error ? e.message : "unknown error",
    });
  }
}
