export function parseDataImageUrl(
  url: string,
): { type: string; bytes: Uint8Array } | null {
  const u = url.trim();
  const m = /^data:(image\/[a-zA-Z0-9.+-]+)(;charset=[^;,]+)?(;base64)?,([\s\S]+)$/.exec(u);
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (type.includes("svg")) return null;
  const isB64 = Boolean(m[3]);
  const payload = m[4] ?? "";
  if (!payload || payload.length > 550_000) return null;
  try {
    if (isB64) {
      const buf = Buffer.from(payload, "base64");
      if (!buf.length) return null;
      return { type, bytes: new Uint8Array(buf) };
    }
    const decoded = decodeURIComponent(payload);
    return { type, bytes: new Uint8Array(Buffer.from(decoded, "utf8")) };
  } catch {
    return null;
  }
}
