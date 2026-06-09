import { env } from "../../config/env";
import {
  createAuthMiddleware,
  requireRole,
  type JwtPayload,
  type AppEnv,
} from "@sebascarvajal11/cima-contracts/hono-auth-middleware";

const authMiddleware = createAuthMiddleware({
  jwtPublicKey: env.JWT_PUBLIC_KEY,
  jwksUri: env.JWKS_URI,
  jwksCacheTtlMs: env.JWKS_CACHE_TTL_MS,
  jwtIss: env.JWT_ISS,
});

export { authMiddleware, requireRole, type JwtPayload, type AppEnv };
export { requireRole as requireGlobalRole };
