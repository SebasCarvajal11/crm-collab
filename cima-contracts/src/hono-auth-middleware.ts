import { createMiddleware } from "hono/factory";
import { getLogger } from "./logger";
import { JwksClient } from "./jwks";
import { AppError } from "./hono-error-handler-middleware";
import { isTokenRevoked, isUserRevoked } from "./token-blocklist";

const logger = getLogger();

type GlobalRole = "admin" | "worker" | "client";

export interface JwtPayload {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  exp: number;
  iat?: number;
  iss?: string;
  kid?: string;
  force_password_change?: boolean;
}

export type AppEnv = {
  Variables: {
    user: JwtPayload;
  };
};

export interface AuthMiddlewareConfig {
  /** SPKI PEM (RSA) for local JWT verification. Takes precedence over JWKS. */
  jwtPublicKey?: string;
  /** JWKS endpoint URI (e.g. http://auth:3000/.well-known/jwks.json). */
  jwksUri?: string;
  /** JWKS cache TTL in milliseconds. Defaults to 5 minutes. */
  jwksCacheTtlMs?: number;
  /** Expected issuer claim. */
  jwtIss?: string;
  /** Si true (default), verifica en Redis si el token o usuario fue revocado. */
  checkTokenBlocklist?: boolean;
}

const normalizePem = (pem: string) => pem.replace(/\\n/g, "\n").trim();

const isRole = (role: string): role is GlobalRole =>
  role === "admin" || role === "worker" || role === "client";

const decodeJwtHeader = (token: string): { kid?: string; alg?: string } => {
  const [headerB64] = token.split(".");
  if (!headerB64) return {};
  try {
    return JSON.parse(
      Buffer.from(headerB64, "base64url").toString("utf8")
    ) as { kid?: string; alg?: string };
  } catch {
    return {};
  }
};

interface CachedTokenVerification {
  payload: JwtPayload;
  expiresAt: number;
}

const publicKeyCache = new Map<string, import("node:crypto").KeyObject>();
const tokenVerificationCache = new Map<string, CachedTokenVerification>();
const MAX_TOKEN_CACHE_SIZE = 1000;
const MAX_TOKEN_CACHE_TTL_MS = 60 * 1000;

const getOrCreatePublicKey = async (
  pem: string
): Promise<import("node:crypto").KeyObject> => {
  const cached = publicKeyCache.get(pem);
  if (cached) return cached;
  const { createPublicKey } = await import("node:crypto");
  const key = createPublicKey(pem);
  publicKeyCache.set(pem, key);
  return key;
};

const getCachedVerifiedPayload = (token: string): JwtPayload | null => {
  const cached = tokenVerificationCache.get(token);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    tokenVerificationCache.delete(token);
    return null;
  }
  return cached.payload;
};

const setCachedVerifiedPayload = (token: string, payload: JwtPayload): void => {
  if (tokenVerificationCache.size >= MAX_TOKEN_CACHE_SIZE) {
    const firstKey = tokenVerificationCache.keys().next().value;
    if (firstKey) tokenVerificationCache.delete(firstKey);
  }
  const now = Date.now();
  const expMs = (payload.exp ?? 0) * 1000;
  const ttlMs = Math.min(Math.max(expMs - now, 0), MAX_TOKEN_CACHE_TTL_MS);
  if (ttlMs > 0) {
    tokenVerificationCache.set(token, { payload, expiresAt: now + ttlMs });
  }
};

const verifyRs256 = async (
  token: string,
  publicKeyPem: string,
  expectedIss?: string
): Promise<JwtPayload> => {
  const cached = getCachedVerifiedPayload(token);
  if (cached) return cached;

  const { createVerify } = await import("node:crypto");
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error("Token JWT malformado");
  }

  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString("utf8")
  ) as JwtPayload;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("Token expirado");
  }
  if (expectedIss && payload.iss !== expectedIss) {
    throw new Error("Issuer no coincide");
  }

  const key = await getOrCreatePublicKey(publicKeyPem);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const valid = verifier.verify(
    key,
    Buffer.from(signatureB64, "base64url")
  );
  if (!valid) throw new Error("Firma JWT inválida");

  setCachedVerifiedPayload(token, payload);
  return payload;
};

/**
 * Creates an auth middleware configured with the given JWKS/PEM settings.
 * Call this once at app startup and pass the result to Hono.
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  const jwksClient: JwksClient | null =
    !config.jwtPublicKey && config.jwksUri
      ? new JwksClient(config.jwksUri, config.jwksCacheTtlMs ?? 5 * 60 * 1000)
      : null;

  const verifyTokenDirectly = async (token: string): Promise<JwtPayload> => {
    if (config.jwtPublicKey) {
      return verifyRs256(token, normalizePem(config.jwtPublicKey), config.jwtIss);
    }

    if (jwksClient) {
      const { kid } = decodeJwtHeader(token);
      const pem = kid
        ? await jwksClient.getPublicKeyPem(kid)
        : (await jwksClient.getAllPublicKeyPems()).values().next().value;

      if (!pem) {
        throw new Error("No se encontró clave pública en JWKS");
      }
      return verifyRs256(token, pem, config.jwtIss);
    }

    logger.error(
      { topic: "auth" },
      "JWT_PUBLIC_KEY ni JWKS_URI configurados — no se puede verificar el token"
    );
    throw new Error("Configuración de autenticación incompleta");
  };

  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.get("user")) {
      await next();
      return;
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(401, "Se requiere un token de autorización");
    }

    const token = authHeader.slice(7);
    try {
      const payload = await verifyTokenDirectly(token);
      if (
        !payload.sub ||
        !payload.userId ||
        !payload.email ||
        !payload.role ||
        !isRole(payload.role)
      ) {
        throw new AppError(401, "Claims JWT incompletos");
      }
      if (config.checkTokenBlocklist !== false) {
        const revoked = await isTokenRevoked(token);
        if (revoked) {
          tokenVerificationCache.delete(token);
          throw new AppError(401, "Token revocado o sesión finalizada");
        }
        if (payload.userId && payload.iat) {
          const userRevoked = await isUserRevoked(payload.userId, payload.iat);
          if (userRevoked) {
            tokenVerificationCache.delete(token);
            throw new AppError(401, "Sesión revocada para este usuario");
          }
        }
      }

      c.set("user", payload);
      await next();
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.warn({ topic: "auth", err }, "Token inválido o expirado");
      throw new AppError(401, "Token inválido o expirado");
    }
  });
}

export const invalidateTokenCache = (token: string): void => {
  tokenVerificationCache.delete(token);
};

export const requireRole = (...roles: GlobalRole[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      throw new AppError(403, `Acceso restringido a: ${roles.join(", ")}`);
    }
    await next();
  });

export {
  revokeToken,
  isTokenRevoked,
  revokeUserSessions,
  isUserRevoked,
  computeTokenHash,
} from "./token-blocklist";
