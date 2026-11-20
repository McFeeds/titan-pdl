import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CLIENT_URL,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  claimShowdownName,
  encodeSession,
  sessionCookieOptions,
} from "@/lib/showdown-auth";

/**
 * GET /api/showdown/login?return=<play.titan-pdl.com URL>
 *
 * Entry point for "Log in with Discord" on play.titan-pdl.com:
 *  1. Not signed in to titan-pdl.com yet -> Discord sign-in via Supabase, coming back here
 *     (through /auth/callback?next=...).
 *  2. Signed in -> claim/look up the Showdown name, set the Showdown session cookie
 *     (shared with play.titan-pdl.com), and send the player back to the client.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const requested = searchParams.get("return") || "";
  // Only ever send people back to our Showdown client.
  const returnTo = requested.startsWith(CLIENT_URL + "/") || requested === CLIENT_URL ? requested : CLIENT_URL + "/";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/api/showdown/login?return=${encodeURIComponent(returnTo)}`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) return errorPage("Couldn't start Discord login. Please try again.", returnTo);
    return NextResponse.redirect(data.url);
  }

  const claim = await claimShowdownName(user);
  if ("error" in claim) return errorPage(claim.error, returnTo);

  const res = NextResponse.redirect(returnTo);
  res.cookies.set(
    SESSION_COOKIE,
    encodeSession({ uid: user.id, name: claim.name, iat: Math.floor(Date.now() / 1000) }),
    sessionCookieOptions(SESSION_MAX_AGE)
  );
  return res;
}

function errorPage(message: string, returnTo: string) {
  const escape = (s: string) =>
    s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
      `<title>Showdown login</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
      `<h1 style="font-size:1.25rem">Couldn't log you in to Showdown</h1><p>${escape(message)}</p>` +
      `<p><a href="${escape(returnTo)}">Back to Showdown</a></p></body>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
