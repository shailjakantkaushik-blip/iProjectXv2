/** Safe brand/logo file → data URL (raster only — no SVG / XSS surface). */

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const MAX_BYTES = 400_000;

export function assertSafeLogoFile(file: File): void {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (type === "image/svg+xml" || name.endsWith(".svg")) {
    throw new Error("SVG logos are not allowed. Upload PNG, JPEG, or WebP.");
  }
  if (type && !ALLOWED_MIME.has(type)) {
    throw new Error("Unsupported image type. Use PNG, JPEG, or WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image is too large (max ~400KB).");
  }
}

export function readSafeLogoDataUrl(file: File): Promise<string> {
  assertSafeLogoFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:image/")) {
        reject(new Error("Invalid image data"));
        return;
      }
      if (result.startsWith("data:image/svg")) {
        reject(new Error("SVG logos are not allowed"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

export const SAFE_LOGO_ACCEPT = "image/png,image/jpeg,image/webp";
