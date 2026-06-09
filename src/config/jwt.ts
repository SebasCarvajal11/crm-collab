import { createPublicKey, createSign } from "node:crypto";
import { env } from "./env";

export const normalizePem = (raw: string) => raw.replace(/\\n/g, "\n").trim();

export const JWT_ALG = "RS256" as const;

const b64urlJson = (obj: object) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

/**
 * Firma JWT RS256 con `kid` en el header para comunicación de servicio a servicio.
 */
export const signServiceJwt = (
  payload: Record<string, unknown>,
): string => {
  const pem = normalizePem(env.SERVICE_JWT_PRIVATE_KEY);
  const header = { alg: JWT_ALG, typ: "JWT", kid: env.SERVICE_JWT_KID };
  const partial = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(partial);
  const signature = signer.sign(pem);
  return `${partial}.${Buffer.from(signature).toString("base64url")}`;
};

/**
 * Documento JWKS (RFC 7517) de crm-collab.
 */
export const getServiceJwksDocument = () => {
  const pem = normalizePem(env.SERVICE_JWT_PUBLIC_KEY);
  const key = createPublicKey(pem);
  const jwk = key.export({ format: "jwk" }) as {
    kty: string;
    n?: string;
    e?: string;
  };

  return {
    keys: [
      {
        ...jwk,
        kid: env.SERVICE_JWT_KID,
        use: "sig",
        alg: JWT_ALG,
      },
    ],
  };
};
