// End-to-end test of the Showdown Discord-login service against a real Showdown server.
// Needs: the league site running (SITE, e.g. `npx next dev -p 3123`) with SHOWDOWN_* env vars, and a
// Showdown server (WS) whose config has our public key in `loginserverextrakeys`.
// Usage: node scripts/test-showdown-login.mjs <session-secret-file> [site] [ws]
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const SECRET = readFileSync(process.argv[2], "utf8").trim();
const SITE = process.argv[3] || "http://localhost:3123";
const WS = process.argv[4] || "ws://localhost:8123/showdown/websocket";

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  -- " + extra : ""}`);
  if (!ok) failures++;
};

// Same format as src/lib/showdown-auth.ts encodeSession
function cookieFor(session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}
async function action(params, cookie) {
  const res = await fetch(`${SITE}/api/showdown/action`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(cookie ? { Cookie: `titan_sd=${cookie}` } : {}) },
    body: new URLSearchParams(params),
  });
  return { status: res.status, body: await res.text(), setCookie: res.headers.get("set-cookie") };
}
const parseJSON = body => JSON.parse(body.startsWith("]") ? body.slice(1) : body);

/** Open a Showdown connection; resolves with helpers once the challstr arrives. */
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    const lines = [];
    const waiters = [];
    ws.addEventListener("error", () => reject(new Error("ws error")));
    ws.addEventListener("message", ev => {
      for (const line of String(ev.data).split("\n")) {
        lines.push(line);
        for (const w of [...waiters]) if (w.re.test(line)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(line); }
        const m = /^\|challstr\|(.+)$/.exec(line);
        if (m) resolve({
          challstr: m[1],
          send: msg => ws.send(msg),
          waitFor: (re, ms = 5000) => new Promise(res => {
            const hit = lines.find(l => re.test(l));
            if (hit) return res(hit);
            const w = { re, resolve: res };
            waiters.push(w);
            setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); res(null); } }, ms);
          }),
          close: () => ws.close(),
        });
      }
    });
  });
}

const NAME = "TitanTest.User";
// Like the real browser client, which appends its own "|<fingerprint>" section when calling action.php.
const browserChallstr = c => `${c.challstr}|647445mqf9449345mqf9622645`;
const good = cookieFor({ uid: "00000000-0000-0000-0000-000000000001", name: NAME, iat: Math.floor(Date.now() / 1000) });

// 1. no session
{
  const c = await connect();
  const r = await action({ act: "upkeep", challstr: c.challstr });
  check("upkeep without session -> not logged in", r.body === "]{}", r.body);
  const g = await action({ act: "getassertion", userid: "someone", challstr: c.challstr });
  check("getassertion without session -> error message", g.body.startsWith(";;"), g.body.slice(0, 60));
  c.close();
}

// 2. valid session: upkeep gives an assertion the real server accepts
{
  const c = await connect();
  const r = await action({ act: "upkeep", challstr: browserChallstr(c) }, good);
  const data = parseJSON(r.body);
  check("upkeep with session -> loggedin + username", data.loggedin === true && data.username === NAME, r.body.slice(0, 80));
  c.send(`|/trn ${NAME},0,${data.assertion}`);
  const upd = await c.waitFor(/^\|updateuser\|\s?TitanTest\.User\|1\|/);
  check("Showdown server accepts the login (renamed, named=1)", !!upd, upd || "no updateuser");
  c.send(`|/cmd userdetails titantestuser`);
  const det = await c.waitFor(/^\|queryresponse\|userdetails\|/);
  const details = det ? JSON.parse(det.split("|").slice(3).join("|")) : {};
  check("user is registered + autoconfirmed on the server", details.autoconfirmed === true, det ? det.slice(0, 120) : "no response");

  // 3. the same assertion can't be replayed on another connection (bound to this challenge)
  const c2 = await connect();
  c2.send(`|/trn ${NAME},0,${data.assertion}`);
  const taken = await c2.waitFor(/^\|nametaken\|/);
  check("replayed assertion on another connection is rejected", !!taken, taken || "accepted!");
  c2.close();
  c.close();
}

// 4. tampering
{
  const c = await connect();
  const r = parseJSON((await action({ act: "upkeep", challstr: browserChallstr(c) }, good)).body);
  const forged = r.assertion.replace(",titantestuser,", ",mcfeeds,");
  c.send(`|/trn mcfeeds,0,${forged}`);
  const taken = await c.waitFor(/^\|nametaken\|/);
  check("assertion edited to another name is rejected by the server", !!taken, taken || "accepted!");
  c.close();

  const [payload, sig] = good.split(".");
  const evilPayload = Buffer.from(JSON.stringify({ uid: "x", name: "mcfeeds", iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const t = await action({ act: "upkeep", challstr: "4|" + "ab".repeat(64) }, `${evilPayload}.${sig}`);
  check("cookie with edited payload is ignored", t.body === "]{}", t.body.slice(0, 60));
  void payload;
  const expired = cookieFor({ uid: "x", name: NAME, iat: Math.floor(Date.now() / 1000) - 31 * 24 * 3600 });
  const e = await action({ act: "upkeep", challstr: "4|" + "ab".repeat(64) }, expired);
  check("expired (31-day-old) session is ignored", e.body === "]{}", e.body.slice(0, 60));
}

// 5. getassertion only for your own name
{
  const g = await action({ act: "getassertion", userid: "mcfeeds", challstr: "4|" + "ab".repeat(64) }, good);
  check("getassertion for someone else's name -> refused", g.body.startsWith(";;"), g.body.slice(0, 70));
  const own = await action({ act: "getassertion", userid: "titantestuser", challstr: "4|" + "ab".repeat(64) }, good);
  check("getassertion for own name -> assertion", /^[0-9a-f]+,titantestuser,4,\d+,showdown\.titan-pdl\.com;[0-9a-f]+$/.test(own.body), own.body.slice(0, 70));
  // The browser appends "|<fingerprint>" to the challstr; only the server's hex challenge is signed.
  const multi = await action({ act: "getassertion", userid: "titantestuser", challstr: "4|" + "ab".repeat(32) + "|647445mqf9449345" }, good);
  check("client-appended section is not signed (only the server hex challenge)", multi.body.startsWith("ab".repeat(32) + ",titantestuser,"), multi.body.slice(0, 90));
}

// 6. logout clears the cookie; password login is refused
{
  const l = await action({ act: "logout" }, good);
  check("logout clears the session cookie", /titan_sd=;/.test(l.setCookie || "") && /Max-Age=0/i.test(l.setCookie || ""), l.setCookie || "no set-cookie");
  const p = parseJSON((await action({ act: "login", name: "x", pass: "y" })).body);
  check("password login refused with Discord hint", /Discord/.test(p.error || ""), p.error);
}

// 7. login entry point: no Supabase session -> Discord OAuth, return URL sanitized
{
  for (const [ret, expectHost] of [["https://play.titan-pdl.com/teambuilder", "play.titan-pdl.com/teambuilder"], ["https://evil.example/", "play.titan-pdl.com/"]]) {
    const res = await fetch(`${SITE}/api/showdown/login?return=${encodeURIComponent(ret)}`, { redirect: "manual" });
    const loc = res.headers.get("location") || "";
    const u = new URL(loc);
    const redirectTo = decodeURIComponent(u.searchParams.get("redirect_to") || "");
    check(`login (return=${ret}) -> Discord OAuth`, res.status >= 300 && res.status < 400 && u.searchParams.get("provider") === "discord", `${res.status} ${loc.slice(0, 60)}`);
    check(`  ...comes back via /auth/callback with sanitized return (${expectHost})`,
      redirectTo.includes("/auth/callback?next=/api/showdown/login?return=") && decodeURIComponent(redirectTo).includes(expectHost) && !decodeURIComponent(redirectTo).includes("evil"),
      redirectTo.slice(0, 140));
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
