import { createPublicKey } from "node:crypto";

export interface JwkEntry {
  kid: string;
  alg: string;
  use: string;
  kty: string;
  n?: string;
  e?: string;
}

interface JwksDocument {
  keys: JwkEntry[];
}

interface CacheEntry {
  pems: Map<string, string>;
  expiresAt: number;
}

/**
 * Cliente JWKS con caché en memoria.
 *
 * Obtiene el conjunto de claves públicas desde el endpoint estándar
 * `/.well-known/jwks.json` de crm-auth y las convierte a PEM SPKI
 * para su uso con `hono/jwt verify()`.
 *
 * El caché se invalida automáticamente transcurrido `cacheTtlMs`
 * y se renueva bajo demanda en la siguiente verificación.
 */
export class JwksClient {
  private readonly jwksUri: string;
  private readonly cacheTtlMs: number;
  private cache: CacheEntry | null = null;

  constructor(jwksUri: string, cacheTtlMs = 5 * 60 * 1000) {
    this.jwksUri = jwksUri;
    this.cacheTtlMs = cacheTtlMs;
  }

  /** Retorna el PEM SPKI para el `kid` solicitado, refrescando caché si es necesario. */
  async getPublicKeyPem(kid: string): Promise<string> {
    const pems = await this.getPems();
    const pem = pems.get(kid);
    if (!pem) {
      // Intentar refrescar una vez en caso de rotación de clave
      const refreshed = await this.fetchAndCache();
      const retried = refreshed.get(kid);
      if (!retried) {
        throw new Error(`JWKS: clave no encontrada para kid="${kid}"`);
      }
      return retried;
    }
    return pem;
  }

  /** Retorna todos los PEMs cacheados (o refresca si el caché expiró). */
  async getAllPublicKeyPems(): Promise<Map<string, string>> {
    return this.getPems();
  }

  private async getPems(): Promise<Map<string, string>> {
    if (this.cache && Date.now() < this.cache.expiresAt) {
      return this.cache.pems;
    }
    return this.fetchAndCache();
  }

  private async fetchAndCache(): Promise<Map<string, string>> {
    const response = await fetch(this.jwksUri, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(
        `JWKS fetch fallido: HTTP ${response.status} desde ${this.jwksUri}`
      );
    }

    const body = (await response.json()) as JwksDocument;
    if (!Array.isArray(body?.keys)) {
      throw new Error("JWKS: respuesta inválida, falta propiedad 'keys'");
    }

    const pems = new Map<string, string>();
    for (const jwk of body.keys) {
      if (jwk.use !== "sig" || !jwk.kid) continue;
      const nodeKey = createPublicKey({
        key: jwk as unknown as import("node:crypto").JsonWebKey,
        format: "jwk",
      });
      const pem = nodeKey.export({ type: "spki", format: "pem" }) as string;
      pems.set(jwk.kid, pem);
    }

    if (pems.size === 0) {
      throw new Error("JWKS: ninguna clave de firma válida encontrada");
    }

    this.cache = { pems, expiresAt: Date.now() + this.cacheTtlMs };
    return pems;
  }
}
