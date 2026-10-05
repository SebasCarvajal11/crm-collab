import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createVerify, createPublicKey } from "node:crypto";
import { env } from "./env";
import { signServiceJwt, getServiceJwksDocument, JWT_ALG } from "./jwt";

describe("collab service jwt", () => {
  it("generates and verifies async signed JWT with RSA-2048 key", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const originalPriv = env.SERVICE_JWT_PRIVATE_KEY;
    const originalPub = env.SERVICE_JWT_PUBLIC_KEY;
    (env as any).SERVICE_JWT_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
    (env as any).SERVICE_JWT_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" });

    try {
      const payload = {
        iss: "crm-collab",
        aud: "crm-media",
        purpose: "media.command",
        correlationId: "corr-jwt-test",
      };

      const token = await signServiceJwt(payload);
      expect(token).toBeTypeOf("string");

      const [headerB64, payloadB64, signatureB64] = token.split(".");
      expect(headerB64).toBeDefined();
      expect(payloadB64).toBeDefined();
      expect(signatureB64).toBeDefined();

      const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
      expect(header.alg).toBe(JWT_ALG);
      expect(header.kid).toBe(env.SERVICE_JWT_KID);

      const decodedPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      expect(decodedPayload.correlationId).toBe("corr-jwt-test");

      const keyObj = createPublicKey(env.SERVICE_JWT_PUBLIC_KEY);
      const verifier = createVerify("RSA-SHA256");
      verifier.update(`${headerB64}.${payloadB64}`);
      const valid = verifier.verify(keyObj, Buffer.from(signatureB64, "base64url"));
      expect(valid).toBe(true);
    } finally {
      (env as any).SERVICE_JWT_PRIVATE_KEY = originalPriv;
      (env as any).SERVICE_JWT_PUBLIC_KEY = originalPub;
    }
  });

  it("returns cached JWKS document", () => {
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const originalPub = env.SERVICE_JWT_PUBLIC_KEY;
    (env as any).SERVICE_JWT_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" });

    try {
      const doc1 = getServiceJwksDocument();
      const doc2 = getServiceJwksDocument();
      expect(doc1).toBe(doc2);
      expect(doc1.keys).toHaveLength(1);
      expect(doc1.keys[0]?.kid).toBe(env.SERVICE_JWT_KID);
    } finally {
      (env as any).SERVICE_JWT_PUBLIC_KEY = originalPub;
    }
  });
});
