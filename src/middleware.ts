import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js Edge Middleware — runs on every matched route BEFORE the page renders.
 *
 * Public routes (no auth needed):
 *   /signin, /signup, /verify-email, /update-password
 *   /interview/*  (candidate-facing — email-verified at app level)
 *   /avatar-debug
 *
 * Protected routes (all admin pages):
 *   /, /job-openings, /candidates, /question-bank, /resume-database,
 *   /evaluation/*, /create-openings, /calendar, etc.
 *
 * Role-based checks happen client-side via AuthContext.
 * Middleware only checks if a token cookie exists.
 */

const PUBLIC_PATHS = [
  "/signin",
  "/signup",
  "/verify-email",
  "/update-password",
  // Reached from an emailed link by someone who cannot sign in — must not
  // require a session.
  "/reset-password",
  "/interview",
  "/secondary-cam",
  "/avatar-debug",
  // Sign-in from AskMira: the one-time link in the URL fragment is the credential.
  "/sso",
  // Talent Agent candidate pages (refresh, invite, interview, my data): the
  // emailed magic link is the credential.
  "/t",
];

const AUTH_PAGES = ["/signin", "/signup"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("auth_token")?.value;

  // If user is on an auth page and already has a token, redirect to dashboard
  if (AUTH_PAGES.some((p) => pathname === p) && token) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Public routes — allow through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Protected routes — require token
  if (!token) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - images, uploads, favicon, public assets
     */
    "/((?!_next/static|_next/image|images|uploads|favicon.ico|models|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|glb|gltf|bin)$).*)",
  ],
};
