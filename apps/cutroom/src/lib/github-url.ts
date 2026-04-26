// Parse anything a user might paste when they mean "this GitHub repo".
// Used by /api/github/resolve and the onboard wizard so the user doesn't
// have to figure out which URL form is the canonical one.

export interface ParsedRepo {
  /** The owner/account, exactly as written. GitHub is case-insensitive but
   *  we preserve case so the rendered display matches what the user typed
   *  if the API call fails. */
  owner: string;
  repo: string;
  /** `owner/repo`. Same shape every existing route already takes. */
  full_name: string;
}

/**
 * Recognise:
 *
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/main
 *   https://github.com/owner/repo/blob/main/README.md
 *   git@github.com:owner/repo.git
 *   github.com/owner/repo
 *   owner/repo
 *
 * Returns null when nothing recognisable is in the input. Trims surrounding
 * whitespace; ignores trailing slashes; strips a trailing `.git`. Owner and
 * repo are validated against GitHub's allowed-character set so a stray
 * "https://example.com/owner/repo" doesn't sneak through.
 */
const SEGMENT = /^[A-Za-z0-9._-]+$/;

export function parseGithubUrl(input: string): ParsedRepo | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  // SSH: git@github.com:owner/repo(.git)?
  const sshMatch = raw.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return validate(sshMatch[1], sshMatch[2]);
  }

  // HTTP(S) or protocol-less github.com URLs.
  const urlMatch = raw.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?(?:[/?#].*)?$/i,
  );
  if (urlMatch) {
    return validate(urlMatch[1], urlMatch[2]);
  }

  // Bare owner/repo. Reject if it looks like a path with a domain.
  const bareMatch = raw.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  if (bareMatch) {
    return validate(bareMatch[1], bareMatch[2]);
  }

  return null;
}

function validate(owner: string, repo: string): ParsedRepo | null {
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) return null;
  if (owner.length > 39 || repo.length > 100) return null; // GitHub's own caps
  return { owner, repo, full_name: `${owner}/${repo}` };
}
