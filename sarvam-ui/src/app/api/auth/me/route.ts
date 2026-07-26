import { NextRequest, NextResponse } from "next/server";

const UPSTREAM =
  process.env.IDENTITYGRAPH_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8001";
const COOKIE = "ig_session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  try {
    const res = await fetch(`${UPSTREAM}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-IG-Token": token,
      },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const out = NextResponse.json({ user: null }, { status: 401 });
      out.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
      return out;
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "API offline", user: null },
      { status: 502 }
    );
  }
}
