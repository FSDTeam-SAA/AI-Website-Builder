import { NextRequest, NextResponse } from "next/server";
import {
  backendRequest,
  checkOrigin,
  clearSession,
  getSessionToken,
  setSession,
} from "@/lib/kora/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };
async function handler(request: NextRequest, { params }: Context) {
  const path = (await params).path.join("/");
  const method = request.method;
  if (method !== "GET") {
    try {
      checkOrigin(request);
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid request origin" },
        { status: 403 },
      );
    }
  }
  let input: unknown;
  if (method === "POST" && /^websites\/[a-fA-F0-9]{24}\/assets$/.test(path)) {
    const reader = request.body?.getReader();
    if (!reader)
      return NextResponse.json(
        { message: "Select an image to upload." },
        { status: 400 },
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 6 * 1024 * 1024) {
        await reader.cancel();
        return NextResponse.json(
          { message: "Images must be 5 MB or smaller." },
          { status: 413 },
        );
      }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      const form = await new Response(bytes, {
        headers: { "Content-Type": request.headers.get("content-type") || "" },
      }).formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
        throw new Error("Invalid image");
      const upload = new FormData();
      upload.set("file", file);
      input = upload;
    } catch {
      return NextResponse.json(
        { message: "Upload one image up to 5 MB." },
        { status: 400 },
      );
    }
  } else if (
    ["POST", "PATCH"].includes(method) ||
    (method === "DELETE" && path !== "session")
  ) {
    const raw = await request.text();
    if (raw.length > 500000)
      return NextResponse.json(
        { success: false, message: "Request is too large" },
        { status: 413 },
      );
    try {
      input = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid JSON" },
        { status: 400 },
      );
    }
  }
  if (path === "session") {
    if (method === "DELETE") {
      const response = NextResponse.json({ success: true });
      clearSession(response);
      return response;
    }
    if (method !== "POST")
      return NextResponse.json({ success: false }, { status: 405 });
    const fields = input as Record<string, unknown> | null;
    if (
      !fields ||
      typeof fields.email !== "string" ||
      typeof fields.password !== "string" ||
      fields.email.length > 320 ||
      fields.password.length > 1024 ||
      (fields.mfaCode !== undefined &&
        (typeof fields.mfaCode !== "string" || fields.mfaCode.length > 20))
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Enter your email, password and optional authenticator code.",
        },
        { status: 400 },
      );
    }
    const login = await backendRequest<{ accessToken: string }>(
      "/auth/login",
      undefined,
      "POST",
      {
        email: fields.email,
        password: fields.password,
        mfaCode: fields.mfaCode || "",
      },
    );
    if (
      login.status !== 200 ||
      typeof login.payload.data?.accessToken !== "string"
    )
      return NextResponse.json(
        { success: false, message: login.payload.message || "Sign-in failed" },
        { status: login.status === 200 ? 502 : login.status },
      );
    const token = login.payload.data.accessToken;
    const context = await backendRequest(
      "/business/website-builder/context",
      token,
    );
    const response = NextResponse.json(context.payload, {
      status: context.status,
      headers: { "Cache-Control": "no-store" },
    });
    if (context.status === 200) setSession(response, token);
    return response;
  }
  // This is a small API adapter, never a general-purpose authenticated proxy.
  const id = "[a-fA-F0-9]{24}";
  const allowed =
    method === "GET"
      ? new RegExp(
          `^(context|models|brand-kits|websites|websites/${id}(/pages|/navigation|/messages|/releases|/assets|/comments|/proposals/${id}|/pages/${id}/versions)?)$`,
        )
      : method === "POST"
        ? new RegExp(
            `^(websites|brand-kits|websites/${id}/(pages|generate|proposals|publish|unpublish|assets|comments)|websites/${id}/pages/${id}/(duplicate|restore)|websites/${id}/proposals/${id}/(apply|discard)|websites/${id}/releases/[0-9]+/republish)$`,
          )
        : method === "PATCH"
          ? new RegExp(
              `^websites/${id}(/pages/${id}|/navigation|/comments/${id})?$`,
            )
          : method === "DELETE"
            ? new RegExp(`^websites/${id}/pages/${id}$`)
            : null;
  if (!allowed?.test(path))
    return NextResponse.json(
      { success: false, message: "Unknown website operation" },
      { status: 404 },
    );
  const token = await getSessionToken();
  if (!token)
    return NextResponse.json(
      { success: false, message: "Sign in to your Kora business account." },
      { status: 401 },
    );
  const query = new URLSearchParams();
  for (const key of ["page", "limit"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  const result = await backendRequest(
    `/business/website-builder/${path}${query.size ? `?${query}` : ""}`,
    token,
    method,
    input,
  );
  const response = NextResponse.json(result.payload, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
  if (result.status === 401) clearSession(response);
  return response;
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
