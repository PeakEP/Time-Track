import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Catalog, Project } from "../types";
import { computeLines, computeTotals, formatCAD, findFinish } from "./pricing";
import { bounds } from "./roomPresets";

type Mode = "client" | "internal";

const BRAND = { indigo: "#2C327C", steel: "#3A7AA0", cyan: "#49C1C4" };

export function exportProjectPdf(project: Project, catalog: Catalog, mode: Mode): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  drawTitleBlock(doc, project, mode, pageW);
  drawPlan(doc, project, pageW, pageH);
  drawSchedule(doc, project, catalog, mode, pageW);
  doc.save(filename(project, mode));
}

function filename(project: Project, mode: Mode): string {
  const safe = (project.meta.name || "Untitled").replace(/[^a-z0-9\-_ ]/gi, "_").trim();
  return `JMRC-${safe || "Untitled"}-${mode === "client" ? "Quote" : "Internal"}.pdf`;
}

function drawTitleBlock(doc: jsPDF, project: Project, mode: Mode, pageW: number): void {
  // gradient bar approximation
  const stripeH = 36;
  doc.setFillColor(BRAND.indigo);
  doc.rect(0, 0, pageW / 3, stripeH, "F");
  doc.setFillColor(BRAND.steel);
  doc.rect(pageW / 3, 0, pageW / 3, stripeH, "F");
  doc.setFillColor(BRAND.cyan);
  doc.rect((2 * pageW) / 3, 0, pageW / 3, stripeH, "F");

  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("JMRC — Cabinet Designer", 24, 24);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(mode === "client" ? "Client Quote" : "Internal Cost Sheet", pageW - 24, 24, {
    align: "right",
  });

  doc.setTextColor("#222");
  doc.setFontSize(10);
  const y = stripeH + 18;
  doc.text(`Project: ${project.meta.name}`, 24, y);
  doc.text(`Client: ${project.meta.client || "—"}`, 24, y + 14);
  doc.text(`Address: ${project.meta.address || "—"}`, 24, y + 28);
  doc.text(`Date: ${project.meta.date}`, pageW - 24, y, { align: "right" });
  doc.text(`Job #: ${project.meta.jobNumber || "—"}`, pageW - 24, y + 14, { align: "right" });
  doc.text(`Catalog: OPPEIN RTA 2025`, pageW - 24, y + 28, { align: "right" });
}

function drawPlan(doc: jsPDF, project: Project, pageW: number, pageH: number): void {
  const room = project.room;
  const b = bounds(room.points);
  const planTop = 110;
  const planBottom = pageH * 0.55;
  const planLeft = 24;
  const planRight = pageW - 24;
  const availW = planRight - planLeft;
  const availH = planBottom - planTop;
  const roomW = b.maxX - b.minX || 1;
  const roomH = b.maxY - b.minY || 1;
  const scale = Math.min(availW / roomW, availH / roomH) * 0.9;
  const offsetX = planLeft + (availW - roomW * scale) / 2;
  const offsetY = planTop + (availH - roomH * scale) / 2;
  const px = (x: number) => offsetX + (x - b.minX) * scale;
  const py = (y: number) => offsetY + (y - b.minY) * scale;

  // walls
  doc.setDrawColor("#222");
  doc.setLineWidth(2);
  const pts = room.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const bp = pts[(i + 1) % pts.length];
    doc.line(px(a.x), py(a.y), px(bp.x), py(bp.y));
  }

  // items
  for (const it of project.items) {
    if (it.scheduleOnly) continue;
    if (it.kind === "window") {
      doc.setDrawColor(BRAND.steel);
      doc.setLineWidth(1.2);
      doc.rect(px(it.x), py(it.y), it.width * scale, it.depth * scale);
      continue;
    }
    if (it.kind === "door") {
      doc.setDrawColor("#444");
      doc.setLineWidth(1.2);
      doc.rect(px(it.x), py(it.y), it.width * scale, it.depth * scale);
      continue;
    }
    const isWall = (it.mountZ ?? 0) > 0;
    doc.setDrawColor(isWall ? "#888" : "#222");
    doc.setLineWidth(isWall ? 0.6 : 1);
    if (isWall) doc.setLineDashPattern([3, 2], 0);
    else doc.setLineDashPattern([], 0);
    const w = (it.rotation === 90 || it.rotation === 270 ? it.depth : it.width) * scale;
    const d = (it.rotation === 90 || it.rotation === 270 ? it.width : it.depth) * scale;
    doc.rect(px(it.x), py(it.y), w, d);
    doc.setFontSize(7);
    doc.setTextColor("#333");
    doc.text(it.sku ?? "", px(it.x) + 2, py(it.y) + 8);
  }
  doc.setLineDashPattern([], 0);

  // overall dimensions
  doc.setFontSize(9);
  doc.setTextColor("#555");
  doc.text(`${Math.round(roomW)}" × ${Math.round(roomH)}"`, (planLeft + planRight) / 2, planBottom + 14, {
    align: "center",
  });
}

function drawSchedule(
  doc: jsPDF,
  project: Project,
  catalog: Catalog,
  mode: Mode,
  pageW: number,
): void {
  const lines = computeLines(
    project.items,
    catalog,
    project.settings.finishCode,
    project.settings.boxMaterial,
  );
  const totals = computeTotals(
    lines,
    catalog,
    project.settings.markup,
    project.settings.hstRate,
  );
  const finish = findFinish(catalog, project.settings.finishCode);

  const headStyles = { fillColor: BRAND.indigo, textColor: "#ffffff", fontStyle: "bold" as const };

  // group by cat
  type Row = (string | number)[];
  const grouped = new Map<string, typeof lines>();
  for (const l of lines) {
    const cat = l.product?.cat ?? "Other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(l);
  }

  const body: Row[] = [];
  let n = 0;
  for (const [cat, ls] of grouped) {
    body.push([{ content: cat, colSpan: mode === "internal" ? 8 : 6, styles: { fillColor: "#eef1f7", fontStyle: "bold" } } as unknown as string]);
    // collapse same SKU
    const counts = new Map<string, { sample: typeof ls[number]; qty: number }>();
    for (const l of ls) {
      const key = `${l.item.sku}|${l.unitListPrice ?? "x"}`;
      const existing = counts.get(key);
      if (existing) existing.qty += l.qty;
      else counts.set(key, { sample: l, qty: l.qty });
    }
    for (const { sample, qty } of counts.values()) {
      n += 1;
      const unitList = sample.unitListPrice ?? 0;
      const lineList = unitList * qty;
      const lineCost = lineList * (1 - catalog._meta.dealer_discount);
      const lineClient = lineCost * project.settings.markup;
      if (mode === "internal") {
        body.push([
          n,
          sample.item.sku ?? "",
          sample.product?.desc ?? "",
          sample.product?.dims ?? "",
          qty,
          formatCAD(unitList),
          formatCAD(lineList),
          formatCAD(lineCost),
        ]);
      } else {
        body.push([
          n,
          sample.item.sku ?? "",
          sample.product?.desc ?? "",
          sample.product?.dims ?? "",
          qty,
          formatCAD(lineClient),
        ]);
      }
    }
  }

  const head: Row[] =
    mode === "internal"
      ? [["#", "SKU", "Description", "Dims", "Qty", "Unit List", "Line List", "JMRC Cost"]]
      : [["#", "SKU", "Description", "Dims", "Qty", "Line Price"]];

  autoTable(doc, {
    startY: doc.internal.pageSize.getHeight() * 0.56,
    head,
    body: body as unknown as (string | number)[][],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles,
    columnStyles:
      mode === "internal"
        ? {
            0: { cellWidth: 24 },
            4: { halign: "right", cellWidth: 36 },
            5: { halign: "right", cellWidth: 70 },
            6: { halign: "right", cellWidth: 70 },
            7: { halign: "right", cellWidth: 70 },
          }
        : {
            0: { cellWidth: 28 },
            4: { halign: "right", cellWidth: 40 },
            5: { halign: "right", cellWidth: 90 },
          },
    margin: { left: 24, right: 24 },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setTextColor("#222");
  const right = pageW - 24;
  const labelX = right - 200;
  let yy = finalY;
  const line = (k: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(k, labelX, yy, { align: "left" });
    doc.text(v, right, yy, { align: "right" });
    yy += 12;
  };
  if (mode === "internal") {
    line("Subtotal (list)", formatCAD(totals.subtotalList));
    line(
      `Dealer discount (${Math.round(catalog._meta.dealer_discount * 100)}%)`,
      `- ${formatCAD(totals.dealerDiscount)}`,
    );
    line("JMRC cost", formatCAD(totals.jmrcCost), true);
    line(`Markup (${totals.markup.toFixed(2)}×)`, formatCAD(totals.clientSubtotal));
    line(`HST (${Math.round(totals.hstRate * 100)}%)`, formatCAD(totals.hst));
    line("Client total", formatCAD(totals.clientTotal), true);
  } else {
    line("Subtotal", formatCAD(totals.clientSubtotal));
    line(`HST (${Math.round(totals.hstRate * 100)}%)`, formatCAD(totals.hst));
    line("Total (CAD)", formatCAD(totals.clientTotal), true);
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor("#666");
  doc.text(
    `Finish: ${finish?.name ?? project.settings.finishCode} (${finish?.tierName ?? ""}) · Box: ${project.settings.boxMaterial === "PLY" ? "Plywood" : "Particle Board"}. Dimensions nominal; verify field measurements before ordering. Pricing per OPPEIN ${catalog._meta.pricing_year ?? 2025} dealer list.`,
    24,
    doc.internal.pageSize.getHeight() - 14,
    { maxWidth: pageW - 48 },
  );
}
