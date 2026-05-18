import type { Context } from "hono";
import type { AppEnv } from "../../shared/middlewares/auth.middleware";

export type CollabActor = {
  sub: string;
  userId: string;
  role: "admin" | "worker" | "client";
  email: string;
  /** JWT del usuario que llamó al API (vía KrakenD), para consultas server-to-server a mod-auth. */
  bearerToken?: string;
};

export function actorFromContext(c: Context<AppEnv>): CollabActor {
  const user = c.get("user");
  const authorization = c.req.header("Authorization");
  return {
    sub: user.sub,
    userId: user.userId,
    role: user.role,
    email: user.email,
    ...(authorization?.startsWith("Bearer ") ? { bearerToken: authorization } : {}),
  };
}
