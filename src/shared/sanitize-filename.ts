export const sanitizeFileName = (input: string) => {
  // NFC normalizes without decomposing Unicode letters (preserves Cyrillic, CJK, etc.)
  const clean = input
    .normalize("NFC")
    // Strip filesystem-unsafe chars: path separators, null bytes, control chars,
    // and common HTTP header injection chars (CR, LF, quotes, backticks)
    .replace(/[/\\:*?"<>|`\x00-\x1f\x7f]/g, "_")
    // Collapse consecutive underscores and trim leading/trailing ones
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    // Safety: cap length to avoid excessively long paths
    .slice(0, 200);
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
