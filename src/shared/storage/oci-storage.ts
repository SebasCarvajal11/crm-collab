import { randomUUID } from "node:crypto";
import * as common from "oci-common";
import * as os from "oci-objectstorage";
import { env } from "../../config/env";

type ParSummary = {
  id?: string;
  timeExpires?: Date;
};

type ListParsPage = {
  opcNextPage?: string;
  items?: ParSummary[];
  preauthenticatedRequestCollection?: { objects?: ParSummary[] };
};

const PAR_EXPIRY_GRACE_MS = 30_000;

const provider = new common.ConfigFileAuthenticationDetailsProvider(
  env.OCI_CONFIG_FILE_PATH,
  env.OCI_CONFIG_PROFILE
);
const client = new os.ObjectStorageClient({ authenticationDetailsProvider: provider });

const objectStorageEndpoint = `https://objectstorage.${env.OCI_REGION}.oraclecloud.com`;
let cachedNamespace: string | null = null;

const getNamespace = async () => {
  if (cachedNamespace) return cachedNamespace;
  const namespaceResponse = await client.getNamespace({});
  cachedNamespace = namespaceResponse.value;
  if (!cachedNamespace) throw new Error("OCI getNamespace sin valor");
  return cachedNamespace;
};

const pruneExpiredPars = async () => {
  if (env.OCI_PAR_PRUNE_MAX <= 0) return;
  const namespace = await getNamespace();
  let page: string | undefined;
  let deleted = 0;
  const now = Date.now();

  while (deleted < env.OCI_PAR_PRUNE_MAX) {
    const response = (await client.listPreauthenticatedRequests({
      namespaceName: namespace,
      bucketName: env.OCI_BUCKET,
      limit: 100,
      page,
    })) as ListParsPage;

    const items =
      response.items ?? response.preauthenticatedRequestCollection?.objects ?? [];

    for (const item of items) {
      if (!item.id) continue;
      const expiresAt = item.timeExpires ? new Date(item.timeExpires).getTime() : Number.NaN;
      if (!Number.isFinite(expiresAt) || expiresAt + PAR_EXPIRY_GRACE_MS >= now) continue;
      try {
        await client.deletePreauthenticatedRequest({
          namespaceName: namespace,
          bucketName: env.OCI_BUCKET,
          parId: item.id,
        });
        deleted += 1;
      } catch (err) {
        console.warn("[mod-collab oci] no se pudo eliminar PAR expirado:", item.id, err);
      }
      if (deleted >= env.OCI_PAR_PRUNE_MAX) break;
    }
    page = response.opcNextPage;
    if (!page) break;
  }
};

const beforeParCreate = async () => {
  try {
    await pruneExpiredPars();
  } catch (err) {
    console.warn("[mod-collab oci] limpieza de PARs expirados falló (se continúa):", err);
  }
};

export const ociStorage = {
  createPresignedUploadUrl: async (key: string, _mimeType: string, ttlSeconds = 300): Promise<string> => {
    const namespace = await getNamespace();
    await beforeParCreate();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const par = await client.createPreauthenticatedRequest({
      namespaceName: namespace,
      bucketName: env.OCI_BUCKET,
      createPreauthenticatedRequestDetails: {
        name: `collab-upload-${randomUUID()}`,
        objectName: key,
        accessType: os.models.CreatePreauthenticatedRequestDetails.AccessType.ObjectWrite,
        timeExpires: expiresAt,
      },
    });
    const accessUri = par.preauthenticatedRequest?.accessUri;
    if (!accessUri) throw new Error("OCI no retornó accessUri para PAR de escritura");
    return `${objectStorageEndpoint}${accessUri}`;
  },

  createPresignedDownloadUrl: async (
    key: string,
    _mimeType: string,
    opts: { forceDownload?: boolean; fileName?: string; ttlSeconds?: number } = {}
  ): Promise<string> => {
    const namespace = await getNamespace();
    await beforeParCreate();
    const ttl = opts.ttlSeconds ?? env.DOC_PAR_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const par = await client.createPreauthenticatedRequest({
      namespaceName: namespace,
      bucketName: env.OCI_BUCKET,
      createPreauthenticatedRequestDetails: {
        name: `collab-read-${randomUUID()}`,
        objectName: key,
        accessType: os.models.CreatePreauthenticatedRequestDetails.AccessType.ObjectRead,
        timeExpires: expiresAt,
      },
    });
    const accessUri = par.preauthenticatedRequest?.accessUri;
    if (!accessUri) throw new Error("OCI no retornó accessUri para PAR de lectura");
    const filename = (opts.fileName ?? key.split("/").pop() ?? "file").replace(/"/g, "");
    const base = `${objectStorageEndpoint}${accessUri}`;
    return opts.forceDownload
      ? `${base}?response-content-disposition=${encodeURIComponent(`attachment; filename="${filename}"`)}`
      : base;
  },

  headObject: async (key: string): Promise<boolean> => {
    const namespace = await getNamespace();
    try {
      await client.headObject({
        namespaceName: namespace,
        bucketName: env.OCI_BUCKET,
        objectName: key,
      });
      return true;
    } catch {
      return false;
    }
  },

  deleteObject: async (key: string): Promise<void> => {
    const namespace = await getNamespace();
    await client.deleteObject({
      namespaceName: namespace,
      bucketName: env.OCI_BUCKET,
      objectName: key,
    });
  },

  listObjects: async (prefix: string) => {
    const namespace = await getNamespace();
    const objects: Array<{ key: string; lastModified: Date | undefined }> = [];
    let start: string | undefined;

    do {
      const response = await client.listObjects({
        namespaceName: namespace,
        bucketName: env.OCI_BUCKET,
        prefix,
        start,
      });
      for (const item of response.listObjects?.objects ?? []) {
        if (item.name) {
          objects.push({ key: item.name, lastModified: item.timeModified });
        }
      }
      start = response.listObjects?.nextStartWith ?? undefined;
    } while (start);

    return objects;
  },
};
