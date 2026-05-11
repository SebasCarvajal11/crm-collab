import type { Context } from "hono";

export function validatedJson<S>(c: Context): S {
  return c.req.valid("json" as never) as S;
}

export function validatedQuery<S>(c: Context): S {
  return c.req.valid("query" as never) as S;
}
