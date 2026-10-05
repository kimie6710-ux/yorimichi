import "server-only";

import type { z } from "zod";
import type { ApiErrorBody, ApiErrorCode } from "@/lib/types";
import { identify } from "./identity";
import { RuleError } from "./services";

export function jsonError(code: ApiErrorCode, message: string, status: number): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status });
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<Parsed<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError("invalid_input", "JSONを読み取れませんでした", 400) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      response: jsonError(
        "invalid_input",
        first ? `${first.path.join(".") || "input"}: ${first.message}` : "入力が正しくありません",
        400,
      ),
    };
  }
  return { ok: true, data: result.data };
}

/** Run a handler as the calling user; turns rule violations into friendly errors. */
export async function asUser(
  req: Request,
  run: (userId: string) => Promise<Response>,
): Promise<Response> {
  const userId = await identify(req);
  if (!userId) return jsonError("unauthorized", "もう一回、開き直してみて。", 401);
  try {
    return await run(userId);
  } catch (err) {
    if (err instanceof RuleError) return jsonError("invalid_input", err.message, err.status);
    console.error("[api]", err);
    return jsonError("db_failed", "うまく保存できなかった。", 500);
  }
}

export function latLngFromSearch(req: Request): { latitude: number; longitude: number } | null {
  const u = new URL(req.url);
  const latitude = Number(u.searchParams.get("lat"));
  const longitude = Number(u.searchParams.get("lng"));
  if (!u.searchParams.get("lat") || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
