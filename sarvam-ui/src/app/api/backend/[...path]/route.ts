import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ path: string[] }> };

const UPSTREAM =
  process.env.IDENTITYGRAPH_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8001";

const COOKIE = "ig_session";

async function proxy(req: NextRequest, path: string[]) {
  const url = `${UPSTREAM}/${path.join("/")}${req.nextUrl.search}`;
  const contentType = req.headers.get("content-type") || "";
  const headers = new Headers();

  const token = req.cookies.get(COOKIE)?.value;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-IG-Token", token);
  }

  const init: RequestInit = {
    method: req.method,
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    if (contentType.includes("multipart/form-data")) {
      init.body = await req.arrayBuffer();
      headers.set("Content-Type", contentType);
    } else {
      headers.set("Content-Type", contentType || "application/json");
      init.body = await req.text();
    }
  }

  init.headers = headers;

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Cannot reach Sarvam_AI API. Run: cd Sarvam_AI && ./run_api.sh",
        upstream: UPSTREAM,
      },
      { status: 502 }
    );
  }

  const buf = await res.arrayBuffer();
  const out = new NextResponse(buf, { status: res.status });
  const ct = res.headers.get("Content-Type");
  const cd = res.headers.get("Content-Disposition");
  if (ct) out.headers.set("Content-Type", ct);
  if (cd) out.headers.set("Content-Disposition", cd);
  return out;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path || []);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path || []);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path || []);
}

export async function OPTIONS(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path || []);
}
