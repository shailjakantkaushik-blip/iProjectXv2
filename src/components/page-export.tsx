import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Download, FileDown, Presentation, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

/** Lazy-load heavy export libs only when the user exports. */
async function loadExportLibs() {
  const [{ toPng }, { jsPDF }, pptxgenMod] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
    import("pptxgenjs"),
  ]);
  return { toPng, jsPDF, pptxgen: pptxgenMod.default ?? pptxgenMod };
}

/**
 * Hide UI chrome (download menus, Expand, etc.) while capturing.
 * Nav/shell are already outside the capture root — this only cleans page chrome.
 */
async function withExportChromeHidden<T>(root: HTMLElement, fn: () => Promise<T>): Promise<T> {
  const hideEls = Array.from(
    root.querySelectorAll<HTMLElement>(".print\\:hidden, [data-export-hide]"),
  );
  const prev = hideEls.map((el) => el.style.display);
  hideEls.forEach((el) => {
    el.style.display = "none";
  });
  try {
    return await fn();
  } finally {
    hideEls.forEach((el, i) => {
      el.style.display = prev[i] || "";
    });
  }
}

type ExportBlock = { top: number; bottom: number };

/**
 * Collect keep-together regions (section cards, explicit export blocks).
 * Coordinates are in snapshot image pixels.
 */
function collectExportBlocks(
  root: HTMLElement,
  scaleX: number,
  scaleY: number,
): ExportBlock[] {
  const rootRect = root.getBoundingClientRect();
  const blocks: ExportBlock[] = [];
  const seen = new Set<Element>();

  const add = (el: Element) => {
    if (seen.has(el)) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    const top = (r.top - rootRect.top + root.scrollTop) * scaleY;
    const bottom = (r.bottom - rootRect.top + root.scrollTop) * scaleY;
    if (bottom - top < 2) return;
    blocks.push({
      top: Math.max(0, top),
      bottom: Math.max(0, bottom),
    });
  };

  // Explicit groups first (e.g. side-by-side chart rows).
  root.querySelectorAll("[data-export-block]").forEach(add);

  // Section cards — skip ones nested inside an explicit export block.
  root.querySelectorAll(".section-frame").forEach((el) => {
    if (el.closest("[data-export-block]")) return;
    add(el);
  });

  root.querySelectorAll(".page-heading").forEach(add);

  return blocks.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
}

/**
 * Build page end Y positions so we never cut through a keep-together block.
 * If a block cannot fit on the remaining page, it moves to the next page.
 * Oversized blocks (taller than one page) fall back to a hard slice.
 */
function computePageEnds(
  contentHeight: number,
  pageHeight: number,
  blocks: ExportBlock[],
): number[] {
  if (contentHeight <= 0) return [0];
  if (pageHeight <= 0) return [contentHeight];

  const ends: number[] = [];
  let y = 0;
  const minProgress = Math.max(24, pageHeight * 0.12);

  while (y < contentHeight - 0.5) {
    const ideal = Math.min(y + pageHeight, contentHeight);
    if (ideal >= contentHeight - 0.5) {
      ends.push(contentHeight);
      break;
    }

    // Blocks that would be sliced by a hard cut at `ideal`.
    const cut = blocks.filter((b) => b.top < ideal && b.bottom > ideal + 0.5 && b.bottom > y);
    let breakAt = ideal;

    if (cut.length > 0) {
      const earliestTop = Math.min(...cut.map((b) => b.top));
      if (earliestTop > y + minProgress) {
        // Move whole block(s) to the next page.
        breakAt = earliestTop;
      } else {
        // Block starts near the top and is taller than the page — hard slice.
        breakAt = ideal;
      }
    } else {
      // Prefer ending just after a completed block for cleaner pages.
      const bottoms = blocks
        .map((b) => b.bottom)
        .filter((b) => b > y + minProgress && b <= ideal + 0.5);
      if (bottoms.length) breakAt = Math.max(...bottoms);
    }

    if (breakAt <= y + 1) breakAt = ideal;
    ends.push(breakAt);
    y = breakAt;
  }

  return ends;
}

async function snapshotDataUrl(el: HTMLElement): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  layoutW: number;
  layoutH: number;
  blocks: ExportBlock[];
}> {
  return withExportChromeHidden(el, async () => {
    const { toPng } = await loadExportLibs();
    const layoutW = Math.max(1, el.scrollWidth);
    const layoutH = Math.max(1, el.scrollHeight);
    // Measure keep-together blocks with chrome already hidden (matches snapshot).
    const layoutBlocks = collectExportBlocks(el, 1, 1);
    const dataUrl = await toPng(el, {
      backgroundColor: "#ffffff",
      pixelRatio: 1.5,
      cacheBust: true,
      width: layoutW,
      height: layoutH,
    });
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    return {
      dataUrl,
      width: img.naturalWidth,
      height: img.naturalHeight,
      layoutW,
      layoutH,
      blocks: layoutBlocks,
    };
  });
}

export async function snapshotElement(el: HTMLElement) {
  const { dataUrl, width, height } = await snapshotDataUrl(el);
  return { dataUrl, width, height };
}

export async function exportElementPNG(el: HTMLElement, name: string) {
  try {
    const { dataUrl } = await snapshotDataUrl(el);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${name}.png`;
    a.click();
  } catch (e: any) {
    toast.error(`PNG export failed: ${e.message ?? e}`);
  }
}

export async function exportElementPDF(
  el: HTMLElement,
  name: string,
  /** Title (ignored for PDF) or options — DownloadMenu may pass a title string */
  titleOrOpts?: string | { orientation?: "portrait" | "landscape" },
) {
  try {
    const { jsPDF } = await loadExportLibs();
    const { dataUrl, width, height, layoutH, blocks: layoutBlocks } =
      await snapshotDataUrl(el);
    const scaleY = height / layoutH;
    const blocks = layoutBlocks.map((b) => ({
      top: b.top * scaleY,
      bottom: b.bottom * scaleY,
    }));

    const opts = typeof titleOrOpts === "object" && titleOrOpts ? titleOrOpts : undefined;
    const orientation = opts?.orientation ?? "landscape";
    const pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const ratio = pw / width;
    const pageCanvasH = ph / ratio;

    const src = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });

    const pageEnds = computePageEnds(height, pageCanvasH, blocks);
    let y = 0;
    pageEnds.forEach((end, idx) => {
      if (idx > 0) pdf.addPage();
      const sliceH = Math.max(1, Math.min(end, height) - y);
      const c = document.createElement("canvas");
      c.width = width;
      c.height = Math.max(1, Math.floor(sliceH));
      c.getContext("2d")!.drawImage(src, 0, y, width, sliceH, 0, 0, width, sliceH);
      // White page fill so short final pages aren't transparent
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pw, ph, "F");
      pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, pw, sliceH * ratio);
      y = end;
    });

    pdf.save(`${name}.pdf`);
  } catch (e: any) {
    toast.error(`PDF export failed: ${e.message ?? e}`);
    throw e;
  }
}

export async function exportElementPPT(el: HTMLElement, name: string, title?: string) {
  try {
    const { pptxgen } = await loadExportLibs();
    const { dataUrl, width, height } = await snapshotDataUrl(el);
    const pres = new pptxgen();
    pres.layout = "LAYOUT_WIDE";
    const slide = pres.addSlide();
    if (title)
      slide.addText(title, {
        x: 0.4,
        y: 0.25,
        w: 12.5,
        h: 0.5,
        fontSize: 20,
        bold: true,
        color: "0B1220",
      });
    const slideW = 13.333,
      slideH = 7.5,
      topPad = title ? 0.9 : 0.4;
    const availW = slideW - 0.8,
      availH = slideH - topPad - 0.4;
    const r = Math.min(availW / width, availH / height);
    const w = width * r,
      h = height * r;
    slide.addImage({ data: dataUrl, x: (slideW - w) / 2, y: topPad, w, h });
    await pres.writeFile({ fileName: `${name}.pptx` });
  } catch (e: any) {
    toast.error(`PPT export failed: ${e.message ?? e}`);
  }
}

/** Small download menu — PDF / PPT / PNG for a given element ref */
export function DownloadMenu({
  targetRef,
  name,
  title,
  label = "Download",
  size = "sm",
  variant = "outline",
  align = "end",
}: {
  targetRef: { current: HTMLElement | null };
  name: string;
  title?: string;
  label?: string;
  size?: "sm" | "xs" | "default";
  variant?: "outline" | "ghost";
  align?: "start" | "end";
}) {
  const run = (fn: (el: HTMLElement, name: string, title?: string) => Promise<void>) => () => {
    if (!targetRef.current) return;
    toast.info(`Preparing ${name}…`);
    void fn(targetRef.current, name, title);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant as any}
          size={size === "xs" ? "sm" : (size as any)}
          className="gap-2 print:hidden"
          data-export-hide
        >
          <Download className="h-3.5 w-3.5" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuItem onClick={run(exportElementPDF)}>
          <FileDown className="mr-2 h-3.5 w-3.5" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={run((el, n, t) => exportElementPPT(el, n, t))}>
          <Presentation className="mr-2 h-3.5 w-3.5" /> PPT
        </DropdownMenuItem>
        <DropdownMenuItem onClick={run(exportElementPNG)}>
          <ImageIcon className="mr-2 h-3.5 w-3.5" /> PNG
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Legacy page wrapper — children only.
 * Bottom "Download page" is owned by AppPageDownload in the /app layout so
 * every eligible page gets one control (no duplicates / missed pages).
 */
export function PageExport({
  children,
}: {
  name?: string;
  title?: string;
  children: ReactNode;
}) {
  return <>{children}</>;
}
