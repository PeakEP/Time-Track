// Branded PDF export. Same scaffolding as cabinet-designer/utils/pdf.ts:
// function-import form of jsPDF + autoTable, a BRAND constant, a faux-gradient
// title block drawn as side-by-side filled rects, and lastAutoTable.finalY to
// place totals.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { LineCost, PricingTotals } from "./pricing";
import { formatCAD } from "./pricing";
import { optionImage } from "./swatch";
import type { Discount, ProjectMeta, UserMode } from "../types";

const BRAND = { indigo: "#2C327C", steel: "#3A7AA0", cyan: "#49C1C4" };

// Render any image (incl. SVG data URIs) to a PNG data URL for jsPDF.addImage.
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
        resolve(null); // tainted canvas / decode failure — skip the thumbnail
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export type ExportArgs = {
  meta: ProjectMeta;
  basePrice: number;
  lines: LineCost[];
  totals: PricingTotals;
  discount: Discount;
  mode: UserMode;
};

export async function exportSelectionsPdf(args: ExportArgs): Promise<void> {
  const { meta, basePrice, lines, totals, discount } = args;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Title block — three side-by-side fills fake the brand gradient.
  const bandH = 66;
  const third = pageW / 3;
  doc.setFillColor(BRAND.indigo);
  doc.rect(0, 0, third, bandH, "F");
  doc.setFillColor(BRAND.steel);
  doc.rect(third, 0, third, bandH, "F");
  doc.setFillColor(BRAND.cyan);
  doc.rect(third * 2, 0, third, bandH, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("Robins Interiors & Design", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Custom Home Finish Selections", margin, 50);

  // Project info block.
  doc.setTextColor("#333333");
  doc.setFontSize(10);
  let y = 90;
  const rows: [string, string][] = [
    ["Client", meta.client || "—"],
    ["Project", meta.project || "—"],
    ["Address", meta.address || "—"],
    ["Date", meta.date || "—"],
    ["Sales Rep", meta.salesRep || "—"],
  ];
  for (const [k, v] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), margin + 70, y);
    y += 15;
  }

  // Pre-render thumbnails.
  const thumbs = await Promise.all(lines.map((l) => toPng(optionImage(l.option))));

  const qtyLabel = (l: LineCost) =>
    l.option.pricing === "included" ? "—" : l.unit === "sqft" ? `${l.quantity} sf` : `×${l.quantity}`;
  const unitLabel = (l: LineCost) =>
    l.option.pricing === "included"
      ? "—"
      : `${formatCAD(l.unitPrice)}${l.unit === "sqft" ? "/sf" : ""}`;

  const body = lines.map((l) => [
    "",
    l.category.name,
    l.option.name,
    l.option.pricing === "included" ? "Included" : qtyLabel(l),
    unitLabel(l),
    l.option.pricing === "included" ? "Incl." : formatCAD(l.lineTotal),
  ]);

  autoTable(doc, {
    startY: y + 10,
    head: [["", "Category", "Selection", "Qty", "Unit", "Amount"]],
    body,
    styles: { fontSize: 9, cellPadding: 4, valign: "middle" },
    headStyles: { fillColor: BRAND.indigo, textColor: "#ffffff" },
    columnStyles: {
      0: { cellWidth: 52, minCellHeight: 42 },
      1: { cellWidth: 92 },
      3: { cellWidth: 46, halign: "right" },
      4: { cellWidth: 60, halign: "right" },
      5: { cellWidth: 62, halign: "right" },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const png = thumbs[data.row.index];
        if (png) doc.addImage(png, "PNG", data.cell.x + 3, data.cell.y + 3, 50, 36);
      }
    },
  });

  // Totals — placed under the table (jsPDF-autotable augments doc at runtime).
  let ty = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  if (ty > pageH - 150) {
    doc.addPage();
    ty = margin + 20;
  }
  const labelX = pageW - margin - 200;
  const valX = pageW - margin;
  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor("#333333");
    doc.text(label, labelX, ty);
    doc.text(value, valX, ty, { align: "right" });
    ty += bold ? 20 : 16;
  };

  row("Base Package", formatCAD(basePrice));
  row("Upgrades", formatCAD(totals.upgrades));
  row("Subtotal", formatCAD(totals.subtotal));
  if (totals.discount > 0) {
    const label =
      discount.type === "percent" ? `${discount.label} (${discount.value}%)` : discount.label;
    row(label, `- ${formatCAD(totals.discount)}`);
  }
  doc.setDrawColor(BRAND.cyan);
  doc.setLineWidth(1);
  doc.line(labelX, ty - 6, valX, ty - 6);
  row("Total", formatCAD(totals.total), true);

  // Notes.
  if (meta.notes) {
    ty += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notes", margin, ty);
    ty += 14;
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(meta.notes, pageW - margin * 2), margin, ty);
    ty += 40;
  }

  // Signature line.
  const sigY = Math.min(ty + 24, pageH - 70);
  doc.setDrawColor("#999999");
  doc.setLineWidth(0.5);
  doc.line(margin, sigY, margin + 220, sigY);
  doc.line(pageW - margin - 160, sigY, pageW - margin, sigY);
  doc.setFontSize(9);
  doc.setTextColor("#777777");
  doc.text("Client Signature", margin, sigY + 14);
  doc.text("Date", pageW - margin - 160, sigY + 14);

  // Footer.
  doc.setFontSize(8);
  doc.setTextColor("#999999");
  doc.text(
    "Prices are estimates, ex. HST, and subject to final contract. Robins Interiors & Design · J.M Robins Construction Ltd.",
    margin,
    pageH - 24
  );

  const fname = `JMRC-Selections-${meta.client || "client"}-${meta.date || ""}`.replace(
    /[^a-z0-9\-_ ]/gi,
    "_"
  );
  doc.save(`${fname}.pdf`);
}
