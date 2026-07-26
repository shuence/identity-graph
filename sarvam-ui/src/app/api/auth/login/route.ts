import { NextRequest, NextResponse } from "next/server";

const UPSTREAM =
  process.env.IDENTITYGRAPH_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8001";
const COOKIE = "ig_session";

export async function POST(req: NextRequest) {
  const body = await req.text();
  let res: Response;
  try {
    res = await fetch(`${UPSTREAM}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "API offline — start Sarvam_AI ./run_api.sh" },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  const out = NextResponse.json({ user: data.user });
  out.cookies.set(COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
  return out;
}
