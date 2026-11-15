import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; page?: string[] }> },
) {
  const { slug, page } = await params;
  const base = process.env.KORA_BACKEND_URL;
  if (!base)
    return new Response("Website hosting is not configured.", { status: 503 });
  if (
    !/^[a-z0-9-]{1,140}$/.test(slug) ||
    (page && (page.length !== 1 || !/^[a-z0-9-]{1,100}$/.test(page[0])))
  )
    return new Response("Page not found.", { status: 404 });
  try {
    const response = await fetch(
      `${base.replace(/\/$/, "")}/public-sites/${slug}${page ? `/${page[0]}` : ""}`,
      {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (response.status === 302 && !page) {
      const target = response.headers.get("location")?.split("/").pop();
      if (target && /^[a-z0-9-]{1,100}$/.test(target)) return Response.redirect(new URL(`/site/${slug}/${target}`, request.url), 302);
    }
    if (!response.ok)
      return new Response(
        response.status === 404
          ? "Website or page unavailable."
          : "Website temporarily unavailable.",
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    return new Response(await response.text(), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https:; form-action 'none'; frame-ancestors 'self'; base-uri 'none'",
      },
    });
  } catch {
    return new Response("Website temporarily unavailable.", { status: 503 });
  }
}
