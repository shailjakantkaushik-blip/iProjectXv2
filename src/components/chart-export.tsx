import { useRef, type ReactNode } from "react";
import { MoreHorizontal, ImageDown, FileDown, Presentation } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import pptxgen from "pptxgenjs";
import { toast } from "sonner";

async function snapshot(el: HTMLElement) {
  return html2canvas(el, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });
}

async function exportPNG(el: HTMLElement, name: string) {
  const canvas = await snapshot(el);
  const link = document.createElement("a");
  link.download = `${name}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function exportPDF(el: HTMLElement, name: string) {
  const canvas = await snapshot(el);
  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pw / canvas.width, ph / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  pdf.addImage(img, "PNG", (pw - w) / 2, (ph - h) / 2, w, h);
  pdf.save(`${name}.pdf`);
}

async function exportPPT(el: HTMLElement, name: string, title?: string) {
  const canvas = await snapshot(el);
  const img = canvas.toDataURL("image/png");
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  const slide = pres.addSlide();
  if (title) slide.addText(title, { x: 0.4, y: 0.25, w: 12.5, h: 0.5, fontSize: 20, bold: true, color: "0B1220" });
  const slideW = 13.333, slideH = 7.5;
  const topPad = title ? 0.9 : 0.4;
  const availW = slideW - 0.8, availH = slideH - topPad - 0.4;
  const ratio = Math.min(availW / canvas.width, availH / canvas.height);
  const w = (canvas.width * ratio), h = (canvas.height * ratio);
  slide.addImage({ data: img, x: (slideW - w) / 2, y: topPad, w, h });
  await pres.writeFile({ fileName: `${name}.pptx` });
}

export function ChartExportMenu({
  targetRef,
  name,
  title,
  className,
}: {
  targetRef: React.RefObject<HTMLElement | null>;
  name: string;
  title?: string;
  className?: string;
}) {
  const run = async (kind: "png" | "pdf" | "ppt") => {
    const el = targetRef.current;
    if (!el) return;
    try {
      if (kind === "png") await exportPNG(el, name);
      if (kind === "pdf") await exportPDF(el, name);
      if (kind === "ppt") await exportPPT(el, name, title);
    } catch (e: any) {
      toast.error(`Export failed: ${e.message ?? e}`);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-50 hover:opacity-100 hover:bg-accent ${className ?? ""}`} title="Export">
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="text-xs">
        <DropdownMenuItem onClick={() => run("png")}><ImageDown className="mr-2 h-3.5 w-3.5" /> Download PNG</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("pdf")}><FileDown className="mr-2 h-3.5 w-3.5" /> Download PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("ppt")}><Presentation className="mr-2 h-3.5 w-3.5" /> Download PPT</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Wrap a chart card. Renders content + a floating tiny export menu in the top-right.
 * The wrapper is what gets exported. Use for chart panels.
 */
export function ExportableChart({
  name,
  title,
  children,
  className,
}: {
  name: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <div className="absolute top-1 right-1 z-10 print:hidden">
        <ChartExportMenu targetRef={ref} name={name} title={title} />
      </div>
      {children}
    </div>
  );
}
