import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createAdminClient, getDiscordUsername } from "@/lib/supabase/admin";

/**
 * Login service for our Pokemon Showdown server (play.titan-pdl.com).
 *
 * Players sign in with Discord on titan-pdl.com; we then set our own signed
 * session cookie (SESSION_COOKIE) for all *.titan-pdl.com hosts. The Showdown
 * client asks /~~titanpdl/action.php (proxied by the VM's Caddy to
 * /api/showdown/action) for a signed "assertion" proving who the player is,
 * which the Showdown server verifies with our public key.
 *
 * Env:
 *   SHOWDOWN_SIGNING_KEY    RSA private key (PEM; "\n" escapes allowed)
 *   SHOWDOWN_SESSION_SECRET random secret for the session cookie HMAC
 *   SHOWDOWN_COOKIE_DOMAIN  ".titan-pdl.com" in production (unset locally)
 *   SHOWDOWN_CLIENT_URL     "https://play.titan-pdl.com"
 */

export const SESSION_COOKIE = "titan_sd";
const SESSION_DAYS = 30;
const SHOWDOWN_HOST = "showdown.titan-pdl.com";
/** Showdown user type 4 = registered + autoconfirmed (see server/users.ts handleRename) */
const USER_TYPE = "4";
const MAX_NAME_LENGTH = 18;

export const CLIENT_URL = process.env.SHOWDOWN_CLIENT_URL || "https://play.titan-pdl.com";

/** Showdown's toID: lowercase, keep only a-z0-9 */
export function toShowdownId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// ---------------------------------------------------------------------------
// Session cookie: base64url(JSON payload) + "." + base64url(HMAC-SHA256)
// ---------------------------------------------------------------------------

export interface ShowdownSession {
  /** Supabase auth user id */
  uid: string;
  /** Showdown display name */
  name: string;
  /** issued-at, seconds */
  iat: number;
}

function sessionSecret(): string {
  const secret = process.env.SHOWDOWN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SHOWDOWN_SESSION_SECRET is not configured");
  return secret;
}

function hmac(data: string): string {
  return createHmac("sha256", sessionSecret()).update(data).digest("base64url");
}

export function encodeSession(session: ShowdownSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function decodeSession(cookie: string | undefined): ShowdownSession | null {
  if (!cookie) return null;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(hmac(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as ShowdownSession;
    if (typeof session.uid !== "string" || typeof session.name !== "string" || typeof session.iat !== "number") {
      return null;
    }
    if (Date.now() / 1000 - session.iat > SESSION_DAYS * 24 * 3600) return null;
    return session;
  } catch {
    return null;
  }
}

/** Cookie attributes shared by set and clear (the domain must match to clear it). */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
    ...(process.env.SHOWDOWN_COOKIE_DOMAIN ? { domain: process.env.SHOWDOWN_COOKIE_DOMAIN } : {}),
  };
}
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 3600;

// ---------------------------------------------------------------------------
// Assertions: "<challenge>,<userid>,<usertype>,<timestamp>,<host>;<hex RSA-SHA256 signature>"
// (format checked by the Showdown server in server/users.ts validateToken)
// ---------------------------------------------------------------------------

function signingKey(): string {
  const key = process.env.SHOWDOWN_SIGNING_KEY;
  if (!key) throw new Error("SHOWDOWN_SIGNING_KEY is not configured");
  return key.replace(/\\n/g, "\n");
}

/**
 * challstr from the client is "<keyid>|<challenge>". The challenge is everything after the key
 * ID and can itself contain "|" (e.g. "4|19d7...|647445mqf..."); the server compares the whole
 * thing, so sign all of it.
 */
export function makeAssertion(challstr: string, name: string): string | null {
  const sep = challstr.indexOf("|");
  const challenge = sep >= 0 ? challstr.slice(sep + 1) : "";
  if (!/^[0-9a-z|]{16,1024}$/i.test(challenge)) return null;
  const userid = toShowdownId(name);
  if (!userid) return null;
  const data = [challenge, userid, USER_TYPE, Math.floor(Date.now() / 1000), SHOWDOWN_HOST].join(",");
  const signature = createSign("RSA-SHA256").update(data).sign(signingKey(), "hex");
  return `${data};${signature}`;
}

// ---------------------------------------------------------------------------
// Discord account -> Showdown name (claimed once, then fixed)
// ---------------------------------------------------------------------------

export type ClaimResult = { name: string } | { error: string };

/**
 * Returns this user's Showdown name, claiming one (their Discord username) on first use.
 * Fails if another Discord account already holds the same Showdown ID.
 */
export async function claimShowdownName(user: User): Promise<ClaimResult> {
  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("showdown_names")
    .select("showdown_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return { error: "Couldn't look up your Showdown name. Please try again." };
  if (existing) return { name: existing.showdown_name };

  const discordName = getDiscordUsername(user.user_metadata)?.trim();
  if (!discordName) return { error: "Couldn't read your Discord username." };
  // Showdown names can't contain | , ; and are at most 18 characters.
  const name = discordName.replace(/[|,;]+/g, "").slice(0, MAX_NAME_LENGTH).trim();
  const showdownId = toShowdownId(name);
  if (!showdownId) return { error: `Your Discord username "${discordName}" has no letters or numbers Showdown can use.` };

  const { error: insertError } = await admin
    .from("showdown_names")
    .insert({ user_id: user.id, showdown_id: showdownId, showdown_name: name });
  if (insertError) {
    if (insertError.code === "23505") {
      // Either this user won a race against themselves (two tabs), or the ID is taken.
      const { data: mine } = await admin
        .from("showdown_names")
        .select("showdown_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mine) return { name: mine.showdown_name };
      return {
        error: `The Showdown name "${name}" is already linked to a different Discord account. Ask a league admin for help.`,
      };
    }
    return { error: "Couldn't save your Showdown name. Please try again." };
  }
  return { name };
}
