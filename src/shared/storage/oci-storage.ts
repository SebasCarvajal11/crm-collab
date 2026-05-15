import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../config/env";

const endpoint = `https://${env.OCI_NAMESPACE}.compat.objectstorage.${env.OCI_REGION}.oraclecloud.com`;

const s3 = new S3Client({
  region: env.OCI_REGION,
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.OCI_ACCESS_KEY,
    secretAccessKey: env.OCI_SECRET_KEY,
  },
});

const BUCKET = env.OCI_BUCKET;

export const ociStorage = {
  uploadObject: async (key: string, body: Buffer, contentType: string): Promise<void> => {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
  },

  downloadObject: async (key: string) => {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
    return result;
  },

  deleteObject: async (key: string): Promise<void> => {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
  },

  /**
   * Genera una URL prefirmada de escritura (PUT) para que el frontend suba
   * el archivo directamente a OCI sin pasar por el servidor Node.js.
   */
  createPresignedUploadUrl: async (
    key: string,
    mimeType: string,
    ttlSeconds = 300
  ): Promise<string> => {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(s3, command, { expiresIn: ttlSeconds });
  },

  /**
   * Verifica que un objeto existe en OCI (HeadObject).
   * Retorna true si existe, false si no fue encontrado.
   */
  headObject: async (key: string): Promise<boolean> => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      return true;
    } catch {
      return false;
    }
  },
};
