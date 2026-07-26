/**
 * Document-as-scroll-root helpers.
 *
 * Best-practice model (Linear / Notion / GitHub app chrome):
 * - The window/document scrolls the page.
 * - App shell is min-height content; main is NOT an overflow-y scrollport.
 * - Body overflow is locked only while a modal/drawer is open.
 * - Never leave overflow/padding/pointer-events stuck after overlays unmount.
 */

export function unlockDocumentScroll() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = "";
  html.style.overscrollBehavior = "";
  body.style.overflow = "";
  body.style.overflowX = "";
  body.style.overflowY = "";
  body.style.paddingRight = "";
  body.style.pointerEvents = "";
  body.removeAttribute("data-scroll-locked");
}

export function lockDocumentScroll() {
  if (typeof document === "undefined") return;
  document.body.style.overflow = "hidden";
}
