export const sanitizeFileName = (input: string) => {
  const clean = input
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || `file_${Date.now()}`;
};

/** Evita inyección en cabeceras HTTP (Content-Disposition). */
export const formatContentDisposition = (
  disposition: "inline" | "attachment",
  fileName: string,
) => {
  const safe = sanitizeFileName(fileName);
  const encoded = encodeURIComponent(safe);
  return `${disposition}; filename="${safe}"; filename*=UTF-8''${encoded}`;
};
