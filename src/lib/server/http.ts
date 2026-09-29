import "server-only";

import type { z } from "zod";
import type { ApiErrorBody, ApiErrorCode } from "@/lib/types";

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
