import type { Context } from "hono";
import { PaginationQuerySchema } from "./collab.schemas";

export function validatedJson<S>(c: Context): S {
  return c.req.valid("json" as never) as S;
}

export function validatedQuery<S>(c: Context): S {
  const raw = c.req.valid("query" as never);
  if (raw !== undefined && raw !== null) {
    return raw as S;
  }
  const params = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  return PaginationQuerySchema.parse(params) as S;
}
