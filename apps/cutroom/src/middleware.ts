import { NextResponse, type NextRequest } from "next/server";

// Host-aware edge gating.
//
// The cutroom is a single-tenant studio. On localhost / the bare Render
// hostname it serves the full editor at /. On the public marketing
// domain (usefoley.com), only the landing page and its supporting assets
// are exposed — studio routes redirect to /welcome instead of leaking
// the operator's local walkthroughs.

const PUBLIC_HOSTS = new Set(["usefoley.com", "www.usefoley.com"]);

// Studio surfaces that have no business being on the public domain.
// Static assets under /walkthroughs/<id>/... (mp4, png, etc.) are
// allowed because the landing page video poster + <video src> resolve
// through the public/walkthroughs symlink.
const BLOCKED_PREFIXES = ["/walkthroughs", "/takes", "/onboard"];

function isPublicHost(req: NextRequest): boolean {
  const raw =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const host = raw.split(":")[0].toLowerCase();
  return PUBLIC_HOSTS.has(host);
}

function hasFileExtension(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}

function isBlockedStudioPath(pathname: string): boolean {
  if (hasFileExtension(pathname)) return false;
  return BLOCKED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function middleware(request: NextRequest) {
  if (!isPublicHost(request)) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    return NextResponse.rewrite(url);
  }

  if (isBlockedStudioPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    url.search = "";
    return NextResponse.redirect(url, 302);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
