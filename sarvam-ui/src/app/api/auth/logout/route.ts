import { NextRequest, NextResponse } from "next/server";

const UPSTREAM =
  process.env.IDENTITYGRAPH_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8001";
const COOKIE = "ig_session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (token) {
    try {
      await fetch(`${UPSTREAM}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-IG-Token": token,
        },
        cache: "no-store",
      });
    } catch {
      /* ignore */
    }
  }
  const out = NextResponse.json({ ok: true });
  out.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return out;
}
