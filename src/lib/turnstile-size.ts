/** compact fits a 320px phone; flexible needs ~300px and gets clipped. */
export function turnstileSizeForWidth(widthPx: number): "compact" | "flexible" {
  return widthPx > 0 && widthPx < 420 ? "compact" : "flexible";
}
