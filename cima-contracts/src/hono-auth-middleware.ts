import { createMiddleware } from "hono/factory";
import { getLogger } from "./logger";
import { JwksClient } from "./jwks";
import { AppError } from "./hono-error-handler-middleware";

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

const verifyRs256 = async (
  token: string,
  publicKeyPem: string,
  expectedIss?: string
): Promise<JwtPayload> => {
  const { createVerify, createPublicKey } = await import("node:crypto");
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

  const key = createPublicKey(publicKeyPem);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const valid = verifier.verify(
    key,
    Buffer.from(signatureB64, "base64url")
  );
  if (!valid) throw new Error("Firma JWT inválida");

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
      c.set("user", payload);
      await next();
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.warn({ topic: "auth", err }, "Token inválido o expirado");
      throw new AppError(401, "Token inválido o expirado");
    }
  });
}

export const requireRole = (...roles: GlobalRole[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      throw new AppError(403, `Acceso restringido a: ${roles.join(", ")}`);
    }
    await next();
  });
