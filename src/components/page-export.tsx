import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Download, FileDown, Presentation, Image as ImageIcon } from "lucide-react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import pptxgen from "pptxgenjs";
import { toast } from "sonner";

async function snapshotDataUrl(el: HTMLElement): Promise<{ dataUrl: string; width: number; height: number }> {
  const width = el.scrollWidth;
  const height = el.scrollHeight;
  const dataUrl = await toPng(el, {
    backgroundColor: "#ffffff",
    pixelRatio: 1.5,
    cacheBust: true,
    width,
    height,
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
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
  } catch (e: any) { toast.error(`PNG export failed: ${e.message ?? e}`); }
}

export async function exportElementPDF(el: HTMLElement, name: string) {
  try {
    const { dataUrl, width, height } = await snapshotDataUrl(el);
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const ratio = pw / width;
    const pageCanvasH = ph / ratio;
    const src = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
    });
    let y = 0, first = true;
    while (y < height) {
      if (!first) pdf.addPage();
      first = false;
      const sliceH = Math.min(pageCanvasH, height - y);
      const c = document.createElement("canvas");
      c.width = width; c.height = sliceH;
      c.getContext("2d")!.drawImage(src, 0, y, width, sliceH, 0, 0, width, sliceH);
      pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, pw, sliceH * ratio);
      y += pageCanvasH;
    }
    pdf.save(`${name}.pdf`);
  } catch (e: any) { toast.error(`PDF export failed: ${e.message ?? e}`); }
}

export async function exportElementPPT(el: HTMLElement, name: string, title?: string) {
  try {
    const { dataUrl, width, height } = await snapshotDataUrl(el);
    const pres = new pptxgen();
    pres.layout = "LAYOUT_WIDE";
    const slide = pres.addSlide();
    if (title) slide.addText(title, { x: 0.4, y: 0.25, w: 12.5, h: 0.5, fontSize: 20, bold: true, color: "0B1220" });
    const slideW = 13.333, slideH = 7.5, topPad = title ? 0.9 : 0.4;
    const availW = slideW - 0.8, availH = slideH - topPad - 0.4;
    const r = Math.min(availW / width, availH / height);
    const w = width * r, h = height * r;
    slide.addImage({ data: dataUrl, x: (slideW - w) / 2, y: topPad, w, h });
    await pres.writeFile({ fileName: `${name}.pptx` });
  } catch (e: any) { toast.error(`PPT export failed: ${e.message ?? e}`); }
}

/** Small download menu — PDF / PPT / PNG for a given element ref */
export function DownloadMenu({
  targetRef, name, title, label = "Download", size = "sm", variant = "outline", align = "end",
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
        <Button variant={variant as any} size={size === "xs" ? "sm" : (size as any)} className="gap-2 print:hidden">
          <Download className="h-3.5 w-3.5" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuItem onClick={run(exportElementPDF)}><FileDown className="mr-2 h-3.5 w-3.5" /> PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={run((el, n, t) => exportElementPPT(el, n, t))}><Presentation className="mr-2 h-3.5 w-3.5" /> PPT</DropdownMenuItem>
        <DropdownMenuItem onClick={run(exportElementPNG)}><ImageIcon className="mr-2 h-3.5 w-3.5" /> PNG</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Wrap a page's main content. Renders children plus a "Download page" pill
 * pinned to the bottom-right for a page-level PDF/PPT/PNG snapshot.
 */
export function PageExport({ name, title, children }: { name: string; title?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="relative">
      <div ref={ref}>{children}</div>
      <div className="mt-6 flex justify-end print:hidden">
        <DownloadMenu targetRef={ref} name={name} title={title} label="Download page" />
      </div>
    </div>
  );
}
