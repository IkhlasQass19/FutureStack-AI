import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path.length || path.some((x) => !/^[-a-zA-Z0-9_]+$/.test(x)))
    return new Response("Invalid path", { status: 400 });
  if (
    req.method !== "GET" &&
    req.headers.get("origin") &&
    new URL(req.headers.get("origin")!).host !== req.headers.get("host")
  )
    return Response.json(
      { detail: "Cross-origin write rejected" },
      { status: 403 },
    );
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.FS_WORKSPACE_TOKEN)
    headers.Authorization = "Bearer " + process.env.FS_WORKSPACE_TOKEN;
  try {
    const upstream = await fetch(
      (process.env.FS_API_URL ?? "http://127.0.0.1:8000") +
        "/v1/" +
        path.join("/") +
        req.nextUrl.search,
      {
        method: req.method,
        headers,
        body: req.method === "GET" ? undefined : await req.text(),
        cache: "no-store",
      },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        detail:
          "The architecture API is unavailable. Start the backend and retry.",
      },
      { status: 502 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PUT };
