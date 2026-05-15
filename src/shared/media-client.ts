import { env } from "../config/env";
import { AppError } from "./middlewares/error-handler.middleware";

type MediaAccessResponse = {
  data?: {
    url?: string;
    expiresInSeconds?: number;
  };
};

export const getMediaDocumentAccessUrl = async (
  actor: { sub: string; role: string; email: string },
  objectKey: string,
  forceDownload: boolean
) => {
  const qs = new URLSearchParams({
    objectKey,
    download: String(forceDownload),
  });
  const url = `${env.MOD_MEDIA_URL}/media/documents/access?${qs.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "X-User-Sub": actor.sub,
        "X-User-Id": actor.sub,
        "X-User-Role": actor.role,
        "X-User-Email": actor.email,
      },
    });
  } catch {
    throw new AppError(502, "No hay conectividad entre mod-collab y mod-media");
  }

  if (!res.ok) {
    throw new AppError(502, "No se pudo obtener acceso al archivo en mod-media");
  }

  const payload = (await res.json()) as MediaAccessResponse;
  const signedUrl = payload.data?.url;
  if (!signedUrl) throw new AppError(502, "mod-media no devolvio URL de acceso");
  return { url: signedUrl, expiresInSeconds: payload.data?.expiresInSeconds ?? 300 };
};

export const deleteDocumentInMedia = async (
  actor: { sub: string; role: string; email: string },
  objectKey: string
) => {
  const qs = new URLSearchParams({ objectKey });
  let res: Response;
  try {
    res = await fetch(`${env.MOD_MEDIA_URL}/media/documents?${qs.toString()}`, {
      method: "DELETE",
      headers: {
        "X-User-Sub": actor.sub,
        "X-User-Id": actor.sub,
        "X-User-Role": actor.role,
        "X-User-Email": actor.email,
      },
    });
  } catch {
    throw new AppError(502, "No hay conectividad entre mod-collab y mod-media");
  }
  if (!res.ok) throw new AppError(502, "No se pudo eliminar archivo en mod-media");
};
