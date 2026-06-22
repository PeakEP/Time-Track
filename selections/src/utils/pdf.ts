import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Discount, ProjectInfo } from "../types";
import type { SelectedLine, Totals } from "../store";

const BRAND = {
  company: "Robins Interiors & Designs",
  tagline: "Custom Home Finish Selections",
  color: [122, 92, 62] as [number, number, number], // warm brown
};

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Render any image (incl. SVG data URIs) to a PNG data URL for jsPDF. */
function toPng(src: string, w = 120, h = 90): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export interface ExportArgs {
  info: ProjectInfo;
  basePrice: number;
  lines: SelectedLine[];
  totals: Totals;
  discount: Discount;
  /** Client mode hides per-line costs of included items etc. (kept simple here). */
  mode: "designer" | "client";
}

export async function exportPdf(args: ExportArgs): Promise<void> {
  const { info, basePrice, lines, totals, discount } = args;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Header band
  doc.setFillColor(...BRAND.color);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(BRAND.company, margin, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(BRAND.tagline, margin, 52);

  // Project info block
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  let y = 92;
  const infoRows: [string, string][] = [
    ["Client", info.clientName || "—"],
    ["Project", info.projectName || "—"],
    ["Address", info.address || "—"],
    ["Date", info.date || "—"],
    ["Sales Rep", info.salesRep || "—"],
  ];
  infoRows.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), margin + 70, y);
    y += 15;
  });

  // Pre-render thumbnails
  const thumbs = await Promise.all(lines.map((l) => toPng(l.option.image)));

  // Selections table with image column
  const body = lines.map((l) => [
    "",
    l.category.name,
    l.option.name,
    l.option.pricing === "included" ? "Included" : "Upgrade",
    l.option.pricing === "included" ? "—" : money(l.effectivePrice),
  ]);

  autoTable(doc, {
    startY: y + 10,
    head: [["", "Category", "Selection", "Type", "Price"]],
    body,
    styles: { fontSize: 9, cellPadding: 4, valign: "middle" },
    headStyles: { fillColor: BRAND.color, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 56, minCellHeight: 42 },
      1: { cellWidth: 110 },
      3: { cellWidth: 64 },
      4: { cellWidth: 70, halign: "right" },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const png = thumbs[data.row.index];
        if (png) {
          const pad = 3;
          doc.addImage(
            png,
            "PNG",
            data.cell.x + pad,
            data.cell.y + pad,
            50,
            36
          );
        }
      }
    },
  });

  // Totals block
  // @ts-expect-error lastAutoTable is added by the plugin at runtime
  let ty: number = doc.lastAutoTable.finalY + 20;
  const labelX = pageW - margin - 200;
  const valX = pageW - margin;

  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.text(label, labelX, ty);
    doc.text(value, valX, ty, { align: "right" });
    ty += bold ? 20 : 16;
  };

  totalRow("Base Package", money(basePrice));
  totalRow("Upgrades", money(totals.upgradesTotal));
  totalRow("Subtotal", money(totals.subtotal));
  if (totals.discountAmount > 0) {
    const dLabel =
      discount.type === "percent"
        ? `${discount.label} (${discount.value}%)`
        : discount.label;
    totalRow(dLabel, `- ${money(totals.discountAmount)}`);
  }
  doc.setDrawColor(...BRAND.color);
  doc.line(labelX, ty - 6, valX, ty - 6);
  totalRow("Total", money(totals.grandTotal), true);

  // Notes
  if (info.notes) {
    ty += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notes", margin, ty);
    ty += 14;
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(info.notes, pageW - margin * 2), margin, ty);
    ty += 40;
  }

  // Signature line
  const sigY = Math.min(ty + 30, doc.internal.pageSize.getHeight() - 70);
  doc.setDrawColor(120, 120, 120);
  doc.line(margin, sigY, margin + 220, sigY);
  doc.line(pageW - margin - 160, sigY, pageW - margin, sigY);
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("Client Signature", margin, sigY + 14);
  doc.text("Date", pageW - margin - 160, sigY + 14);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "Prices are estimates and subject to final contract. Generated by Robins Interiors & Designs Finish Selections.",
    margin,
    doc.internal.pageSize.getHeight() - 24
  );

  const fname = `${info.clientName || "Selections"}-${info.date || ""}`.replace(/[^a-z0-9-]+/gi, "_");
  doc.save(`${fname}.pdf`);
}
