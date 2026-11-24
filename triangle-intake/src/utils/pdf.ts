// Branded hand-off PDF for the designer. Same scaffolding as the other JMRC
// apps (function-import jsPDF + autoTable, a faux-gradient title band,
// lastAutoTable.finalY to place following blocks). NO pricing — this is an
// intake sheet, not a quote.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { optionImage } from "./swatch";
import type { ProjectMeta } from "../types";
import type { SummaryLine } from "./summary";

const BRAND = { indigo: "#2C327C", steel: "#3A7AA0", cyan: "#49C1C4" };

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
        // letterbox "contain" so tall doors aren't distorted
        const ratio = Math.min(w / (img.width || w), h / (img.height || h));
        const dw = (img.width || w) * ratio;
        const dh = (img.height || h) * ratio;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export type ExportArgs = {
  meta: ProjectMeta;
  lines: SummaryLine[];
  requests: string;
  flags: string[];
};

export async function exportIntakePdf(args: ExportArgs): Promise<void> {
  const { meta, lines, requests, flags } = args;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Title band — three fills fake the brand gradient.
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
  doc.text("Triangle Kitchen — Cabinet Intake", margin, 50);

  // Project info block (two columns).
  doc.setTextColor("#333333");
  doc.setFontSize(10);
  const left: [string, string][] = [
    ["Client", meta.client || "—"],
    ["Contact", meta.contact || "—"],
    ["Address", meta.address || "—"],
    ["Project type", meta.projectType || "—"],
  ];
  const right: [string, string][] = [
    ["Date", meta.date || "—"],
    ["Designer", meta.designer || "—"],
    ["Taken by", meta.employee || "—"],
    ["Timeline", meta.timeline || "—"],
  ];
  let y = 90;
  const colX = pageW / 2 + 10;
  const rowH = 15;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i]) {
      doc.setFont("helvetica", "bold");
      doc.text(`${left[i][0]}:`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(String(left[i][1]), colX - margin - 78), margin + 74, y);
    }
    if (right[i]) {
      doc.setFont("helvetica", "bold");
      doc.text(`${right[i][0]}:`, colX, y);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(String(right[i][1]), pageW - margin - colX - 70), colX + 66, y);
    }
    y += rowH;
  }

  // Selections table.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(BRAND.indigo);
  doc.text("Selections", margin, y + 14);
  y += 20;

  const thumbs = await Promise.all(
    lines.map((l) => (l.options[0]?.image ? toPng(optionImage(l.options[0])) : Promise.resolve(null))),
  );

  const body = lines.map((l) => {
    const sel = l.options.map((o) => o.name).join(", ") || "—";
    const detail = [sel, l.note ? `Note: ${l.note}` : ""].filter(Boolean).join("\n");
    return ["", l.step.name, detail];
  });

  autoTable(doc, {
    startY: y,
    head: [["", "Selection", "Choice"]],
    body,
    styles: { fontSize: 9.5, cellPadding: 5, valign: "middle", textColor: "#333333" },
    headStyles: { fillColor: BRAND.indigo, textColor: "#ffffff" },
    columnStyles: {
      0: { cellWidth: 52, minCellHeight: 42 },
      1: { cellWidth: 150, fontStyle: "bold" },
      2: { cellWidth: "auto" },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const png = thumbs[data.row.index];
        if (png) doc.addImage(png, "PNG", data.cell.x + 4, data.cell.y + 3, 44, 36);
      }
    },
  });

  let ty = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;

  const ensure = (needed: number) => {
    if (ty > pageH - needed) {
      doc.addPage();
      ty = margin + 20;
    }
  };

  // Notes & special requests.
  if (requests.trim()) {
    ensure(120);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(BRAND.indigo);
    doc.text("Notes & special requests", margin, ty);
    ty += 15;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#333333");
    const wrapped = doc.splitTextToSize(requests.trim(), pageW - margin * 2);
    doc.text(wrapped, margin, ty);
    ty += wrapped.length * 13 + 12;
  }

  // Designer verification checklist.
  if (flags.length) {
    ensure(60 + flags.length * 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(BRAND.indigo);
    doc.text("Designer verification — confirm before ordering", margin, ty);
    ty += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor("#333333");
    for (const f of flags) {
      ensure(40);
      doc.setDrawColor("#8a8a8a");
      doc.setLineWidth(0.8);
      doc.rect(margin, ty - 8, 9, 9); // checkbox
      const wrapped = doc.splitTextToSize(f, pageW - margin * 2 - 18);
      doc.text(wrapped, margin + 16, ty);
      ty += wrapped.length * 12 + 6;
    }
    ty += 6;
  }

  // Sign-off lines.
  ensure(56);
  const sigY = Math.min(ty + 22, pageH - 56);
  doc.setDrawColor("#999999");
  doc.setLineWidth(0.5);
  doc.line(margin, sigY, margin + 220, sigY);
  doc.line(pageW - margin - 200, sigY, pageW - margin, sigY);
  doc.setFontSize(9);
  doc.setTextColor("#777777");
  doc.text("Taken by (employee) / Date", margin, sigY + 14);
  doc.text("Designer received / Date", pageW - margin - 200, sigY + 14);

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor("#999999");
    doc.text(
      "Triangle Kitchen intake — no pricing. Colours are approximate; confirm species, door style & finish from a physical sample. Robins Interiors & Design · J.M Robins Construction Ltd.",
      margin,
      pageH - 22,
      { maxWidth: pageW - margin * 2 },
    );
  }

  const fname = `JMRC-Triangle-Intake-${meta.client || "client"}-${meta.date || ""}`.replace(/[^a-z0-9\-_ ]/gi, "_");
  doc.save(`${fname}.pdf`);
}
