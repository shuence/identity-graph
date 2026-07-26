import { NextRequest, NextResponse } from "next/server";

const COOKIE = "ig_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/app")) {
    return NextResponse.next();
  }
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
