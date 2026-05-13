import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import { env } from "../../config/env";
import { ForbiddenError, UnauthorizedError } from "./error-handler.middleware";

type GlobalRole = "admin" | "worker" | "client";

export interface JwtPayload {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  exp: number;
  iat?: number;
  iss?: string;
}

export type AppEnv = {
  Variables: {
    user: JwtPayload;
  };
};

const normalizePem = (pem: string) => pem.replace(/\r\n/g, "\n").trim();

const isRole = (role: string): role is GlobalRole =>
  role === "admin" || role === "worker" || role === "client";

const fromGatewayHeaders = (c: {
  req: { header: (name: string) => string | undefined };
}): JwtPayload | null => {
  if (!env.TRUST_GATEWAY_JWT_HEADERS) return null;
  if (c.req.header("X-Gateway-Trust") !== env.GATEWAY_TRUST_SECRET) return null;

  const sub = c.req.header("X-User-Sub")?.trim();
  const userId = c.req.header("X-User-Id")?.trim();
  const role = c.req.header("X-User-Role")?.trim();
  const email = c.req.header("X-User-Email")?.trim();
  const expRaw = c.req.header("X-Token-Exp")?.trim();

  if (!sub || !userId || !role || !email || !isRole(role)) return null;

  const expParsed = expRaw ? Number.parseInt(expRaw, 10) : Number.NaN;
  const exp = Number.isFinite(expParsed) ? expParsed : Math.floor(Date.now() / 1000) + 900;
  return { sub, userId, role, email, exp };
};

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (env.TRUST_GATEWAY_JWT_HEADERS) {
    const trustHeader = c.req.header("X-Gateway-Trust");
    if (!trustHeader) {
      console.warn("[auth] X-Gateway-Trust header missing — falling back to JWT verification");
    } else if (trustHeader !== env.GATEWAY_TRUST_SECRET) {
      console.warn("[auth] X-Gateway-Trust mismatch — falling back to JWT verification");
    }
  }

  const headerPayload = fromGatewayHeaders(c);
  if (headerPayload) {
    c.set("user", headerPayload);
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Se requiere token Bearer");
  }

  if (!env.JWT_PUBLIC_KEY) {
    throw new UnauthorizedError("JWT_PUBLIC_KEY no configurada para validacion local");
  }

  const token = authHeader.slice(7);
  try {
    const options: "RS256" | { alg: "RS256"; iss: string } = env.JWT_ISS
      ? { alg: "RS256", iss: env.JWT_ISS }
      : "RS256";
    const payload = (await verify(
      token,
      normalizePem(env.JWT_PUBLIC_KEY),
      options
    )) as unknown as Partial<JwtPayload>;
    if (!payload.sub || !payload.userId || !payload.email || !payload.role || !isRole(payload.role)) {
      throw new UnauthorizedError("Claims JWT incompletos");
    }
    c.set("user", payload as JwtPayload);
    await next();
  } catch {
    throw new UnauthorizedError("Token invalido o expirado");
  }
});

export const requireGlobalRole = (...roles: GlobalRole[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenError(`Acceso restringido a: ${roles.join(", ")}`);
    }
    await next();
  });
