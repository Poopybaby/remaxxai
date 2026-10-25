import "server-only";
import { NextResponse } from "next/server";
import { PermissionError } from "@/lib/auth/permissions";
import { SaveError } from "@/lib/projects/versions";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Turns known errors into clear responses; anything unexpected is logged and kept vague. */
export function handleRouteError(err: unknown, context: string) {
  if (err instanceof PermissionError) return jsonError(403, err.message, "forbidden");
  if (err instanceof SaveError) {
    const status = err.code === "conflict" ? 409 : err.code === "not_found" ? 404 : 422;
    return jsonError(status, err.message, err.code);
  }
  console.error(`[${context}]`, err);
  return jsonError(500, "Something went wrong on our side. Try again in a moment.", "server");
}
