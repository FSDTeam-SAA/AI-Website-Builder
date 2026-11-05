import "server-only";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const sessionCookie =
  process.env.NODE_ENV === "production"
    ? "__Host-kora-builder-session"
    : "kora-builder-session";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function checkOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    throw new Error("Invalid request origin");
  }
}

type BackendPayload<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  meta?: unknown;
};
export async function backendRequest<T = unknown>(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; payload: BackendPayload<T> }> {
  const base = process.env.KORA_BACKEND_URL;
  if (!base)
    return {
      status: 503,
      payload: {
        success: false,
        message:
          "Set KORA_BACKEND_URL to your Kora backend API URL (including /api/v1).",
      },
    };
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method,
      cache: "no-store",
      redirect: "error",
      headers: {
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      signal: AbortSignal.timeout(
        path.endsWith("/generate") || path.endsWith("/proposals")
          ? 120000
          : 15000,
      ),
    });
    const payload = await response.json().catch(() => ({
      success: false,
      message: "Kora returned an unreadable response.",
    }));
    return {
      status: response.status,
      payload: {
        success: payload.success,
        message: payload.message,
        data: payload.data,
        ...(payload.meta ? { meta: payload.meta } : {}),
      },
    };
  } catch {
    return {
      status: 503,
      payload: {
        success: false,
        message: "The Kora backend is unavailable. Please retry.",
      },
    };
  }
}

export async function getSessionToken() {
  return (await cookies()).get(sessionCookie)?.value;
}
export function setSession(response: NextResponse, token: string) {
  // Backend validates the token on every API call; the browser never reads it.
  response.cookies.set(sessionCookie, token, cookieOptions);
}
export function clearSession(response: NextResponse) {
  response.cookies.set(sessionCookie, "", { ...cookieOptions, maxAge: 0 });
}
