import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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
};
