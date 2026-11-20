import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  decodeSession,
  makeAssertion,
  sessionCookieOptions,
  toShowdownId,
} from "@/lib/showdown-auth";

/**
 * Showdown client "action.php" protocol, for play.titan-pdl.com.
 * Caddy on the Showdown VM proxies https://play.titan-pdl.com/~~titanpdl/action.php here,
 * so the browser sends its *.titan-pdl.com cookies (incl. our session cookie).
 *
 *   act=upkeep       -> "]" + JSON { loggedin, username, assertion }  (auto-login on page load)
 *   act=getassertion -> plain assertion, or ";;<message>" to show an error popup
 *   act=logout       -> clears the session cookie
 *   act=login        -> passwords aren't used; tells the user to log in with Discord
 */

const NEED_LOGIN = 'Log in with Discord to use a name: click "Choose name", then "Log in with Discord".';

function text(body: string, init?: ResponseInit) {
  return new NextResponse(body, {
    ...init,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return text(";;Bad request", { status: 400 });
  }
  const act = String(form.get("act") || "");
  const challstr = String(form.get("challstr") || "");
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);

  switch (act) {
    case "upkeep": {
      if (!session) return text("]{}");
      const assertion = makeAssertion(challstr, session.name);
      if (!assertion) return text("]{}");
      return text("]" + JSON.stringify({ loggedin: true, username: session.name, assertion }));
    }

    case "getassertion": {
      const userid = String(form.get("userid") || "");
      if (!session) return text(";;" + NEED_LOGIN);
      if (toShowdownId(session.name) !== userid) {
        return text(`;;You're logged in as ${session.name}. Your Showdown name is linked to your Discord account.`);
      }
      const assertion = makeAssertion(challstr, session.name);
      return text(assertion ?? ";;Couldn't create a login token. Please reload the page.");
    }

    case "logout": {
      const res = text("]{}");
      res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
      return res;
    }

    case "login":
      return text("]" + JSON.stringify({ error: NEED_LOGIN }));

    default:
      return text("]{}");
  }
}
