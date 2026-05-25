import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Catalog, Project } from "../types";
import { computeLines, computeTotals, formatCAD, findFinish } from "./pricing";
import { bounds, edges } from "./roomPresets";
import { itemDimsLabel, footprint } from "./placement";
import { finishColor } from "./finishColors";
import { assignItemsToWalls, type ElevBox } from "./elevation";

type Mode = "client" | "internal";

const BRAND = { indigo: "#2C327C", steel: "#3A7AA0", cyan: "#49C1C4" };

export function exportProjectPdf(
  project: Project,
  catalog: Catalog,
  mode: Mode,
  pricing = true,
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Page 1 — aerial plan
  drawTitleBlock(doc, project, mode, pageW, pricing, "Floor Plan (aerial)");
  drawPlan(doc, project, pageW, pageH);
  drawFootnote(doc, project, catalog, pricing, pageW, pageH);

  // Page 2 — elevations (face views) for each wall
  doc.addPage();
  drawTitleBlock(doc, project, mode, pageW, pricing, "Elevations (face views)");
  drawElevations(doc, project, pageW, pageH);
  drawFootnote(doc, project, catalog, pricing, pageW, pageH);

  // Page 3 — schedule + pricing
  doc.addPage();
  drawTitleBlock(doc, project, mode, pageW, pricing, pricing ? (mode === "client" ? "Client Quote" : "Internal Cost Sheet") : "Cabinet Schedule");
  drawSchedule(doc, project, catalog, mode, pageW, pricing);
  drawFootnote(doc, project, catalog, pricing, pageW, pageH);

  doc.save(filename(project, mode, pricing));
}

function filename(project: Project, mode: Mode, pricing: boolean): string {
  const safe = (project.meta.name || "Untitled").replace(/[^a-z0-9\-_ ]/gi, "_").trim();
  const suffix = !pricing ? "Schedule" : mode === "client" ? "Quote" : "Internal";
  return `JMRC-${safe || "Untitled"}-${suffix}.pdf`;
}

function drawTitleBlock(doc: jsPDF, project: Project, mode: Mode, pageW: number, pricing: boolean, pageLabel: string): void {
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
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(pageLabel, pageW - 24, 24, {
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

function fmtFt(inches: number): string {
  const n = Math.round(inches);
  const ft = Math.floor(n / 12);
  const rem = n % 12;
  return ft > 0 ? `${ft}'-${rem}"` : `${n}"`;
}

function drawPlan(doc: jsPDF, project: Project, pageW: number, pageH: number): void {
  const room = project.room;
  const b = bounds(room.points);
  const planTop = 96;
  const planBottom = pageH - 44;
  const planLeft = 60;
  const planRight = pageW - 60;
  const availW = planRight - planLeft;
  const availH = planBottom - planTop;
  const roomW = b.maxX - b.minX || 1;
  const roomH = b.maxY - b.minY || 1;
  const scale = Math.min(availW / roomW, availH / roomH) * 0.86;
  const offsetX = planLeft + (availW - roomW * scale) / 2;
  const offsetY = planTop + (availH - roomH * scale) / 2;
  const px = (x: number) => offsetX + (x - b.minX) * scale;
  const py = (y: number) => offsetY + (y - b.minY) * scale;

  // floor fill
  doc.setFillColor("#fbfcfe");
  const poly = room.points.map((p) => [px(p.x), py(p.y)] as [number, number]);
  // walls + per-wall dimension labels
  doc.setDrawColor("#222");
  doc.setLineWidth(2);
  const pts = room.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const bp = pts[(i + 1) % pts.length];
    doc.line(px(a.x), py(a.y), px(bp.x), py(bp.y));
    const len = Math.hypot(bp.x - a.x, bp.y - a.y);
    const mx = (px(a.x) + px(bp.x)) / 2;
    const my = (py(a.y) + py(bp.y)) / 2;
    doc.setFontSize(8);
    doc.setTextColor(BRAND.steel);
    doc.text(fmtFt(len), mx, my - 3, { align: "center" });
  }

  // items
  for (const it of project.items) {
    if (it.scheduleOnly) continue;
    const fp = footprint(it);
    const w = fp.w * scale;
    const d = fp.d * scale;
    const x0 = px(it.x);
    const y0 = py(it.y);
    if (it.kind === "window") {
      doc.setDrawColor(BRAND.steel);
      doc.setFillColor("#cfe6f1");
      doc.setLineWidth(1);
      doc.rect(x0, y0, w, d, "FD");
      continue;
    }
    if (it.kind === "door") {
      doc.setDrawColor("#444");
      doc.setLineWidth(1);
      doc.rect(x0, y0, w, d);
      continue;
    }
    const isWall = (it.mountZ ?? 0) > 0;
    doc.setDrawColor("#1f2532");
    doc.setLineWidth(isWall ? 0.6 : 1);
    if (isWall) doc.setLineDashPattern([3, 2], 0);
    else doc.setLineDashPattern([], 0);
    doc.setFillColor(isWall ? "#f3f0ea" : "#ece7dd");
    doc.rect(x0, y0, w, d, "FD");
    doc.setLineDashPattern([], 0);
    if (w > 16) {
      doc.setFontSize(6.5);
      doc.setTextColor("#1f2532");
      doc.text(it.sku ?? it.label ?? "", x0 + w / 2, y0 + d / 2 - 1, { align: "center" });
      doc.setFontSize(5.5);
      doc.setTextColor("#555");
      doc.text(`${Math.round(it.width)}"`, x0 + w / 2, y0 + d / 2 + 6, { align: "center" });
    }
  }
  doc.setLineDashPattern([], 0);

  // overall dimensions
  doc.setFontSize(10);
  doc.setTextColor("#222");
  doc.setFont("helvetica", "bold");
  doc.text(`Overall: ${fmtFt(roomW)} W × ${fmtFt(roomH)} D`, (planLeft + planRight) / 2, planBottom + 24, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  if (poly.length === 0) return; // keep poly referenced
}

function drawElevations(doc: jsPDF, project: Project, pageW: number, pageH: number): void {
  const finishHex = finishColor(project.settings.finishCode);
  const wallH = project.settings.wallHeight;
  const ee = edges(project.room.points);
  const byWall = assignItemsToWalls(project.items, project.room.points);
  // only walls that have items on them
  const walls = ee
    .map((e) => {
      const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) || 1;
      return { i: e.index, len, items: byWall.get(e.index) ?? [] };
    })
    .filter((w) => w.items.length > 0);

  const top = 92;
  const left = 40;
  const right = pageW - 40;
  const bottom = pageH - 44;
  if (walls.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor("#888");
    doc.text("No cabinets placed yet.", pageW / 2, (top + bottom) / 2, { align: "center" });
    return;
  }
  // one wall per full-width band so labels stay readable; up to 3 bands/page
  const perPage = 3;
  const fullW = right - left;
  const bandH = (bottom - top) / Math.min(walls.length, perPage);

  walls.forEach((w, idx) => {
    if (idx > 0 && idx % perPage === 0) {
      doc.addPage();
      drawTitleBlock(doc, project, "internal", pageW, true, "Elevations (face views, cont.)");
    }
    const slot = idx % perPage;
    const cy = top + slot * bandH;
    drawOneElevation(doc, w.i + 1, w.len, w.items, wallH, finishHex, project, left, cy, fullW, bandH);
  });
}

function drawOneElevation(
  doc: jsPDF,
  wallNum: number,
  len: number,
  items: ElevBox[],
  wallH: number,
  finishHex: string,
  project: Project,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
): void {
  // label
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BRAND.indigo);
  doc.text(`Wall ${wallNum} — ${fmtFt(len)} wide`, cellX, cellY + 8);
  doc.setFont("helvetica", "normal");

  const drawTop = cellY + 14;
  const drawH = cellH - 20;
  const scale = Math.min(cellW / len, drawH / wallH) * 0.96;
  const ox = cellX + (cellW - len * scale) / 2;
  const oy = drawTop + (drawH - wallH * scale) / 2;
  const X = (along: number) => ox + along * scale;
  const Y = (z: number) => oy + (wallH - z) * scale;

  // wall background + floor
  doc.setDrawColor("#9aa6b8");
  doc.setLineWidth(0.5);
  doc.setFillColor("#eef1f6");
  doc.rect(ox, oy, len * scale, wallH * scale, "FD");
  // reference lines
  doc.setDrawColor(BRAND.steel);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([2, 1.5], 0);
  doc.line(ox, Y(project.settings.counterHeight), ox + len * scale, Y(project.settings.counterHeight));
  doc.line(ox, Y(project.settings.wallCabinetAFF), ox + len * scale, Y(project.settings.wallCabinetAFF));
  doc.setLineDashPattern([], 0);
  doc.setFontSize(5.5);
  doc.setTextColor(BRAND.steel);
  doc.text(`Counter ${project.settings.counterHeight}"`, ox + 1, Y(project.settings.counterHeight) - 1);
  doc.text(`Uppers ${project.settings.wallCabinetAFF}" AFF`, ox + 1, Y(project.settings.wallCabinetAFF) - 1);
  // floor
  doc.setDrawColor("#1f2532");
  doc.setLineWidth(1);
  doc.line(ox - 3, Y(0), ox + len * scale + 3, Y(0));

  for (const e of items) {
    const it = e.item;
    const x = X(e.alongMin);
    const w = (e.alongMax - e.alongMin) * scale;
    const y = Y(e.top);
    const h = (e.top - e.bottom) * scale;
    const isOpening = it.kind === "window" || it.kind === "door";
    const isAppliance = it.kind === "appliance";
    if (isOpening) {
      doc.setFillColor(it.kind === "window" ? "#cfe6f1" : "#ffffff");
      doc.setDrawColor(BRAND.steel);
    } else if (isAppliance) {
      doc.setFillColor("#cfd6e0");
      doc.setDrawColor("#5a6478");
    } else {
      doc.setFillColor(finishHex);
      doc.setDrawColor("#1f2532");
    }
    doc.setLineWidth(0.5);
    doc.rect(x, y, w, h, "FD");
    // shaker frame hint
    if (!isOpening && !isAppliance && w > 10 && h > 10) {
      doc.setDrawColor("#00000030");
      doc.setLineWidth(0.3);
      doc.rect(x + 2, y + 2, w - 4, h - 4);
    }
    // label: SKU centred, rotated vertically when the box is narrow so it
    // never overlaps a neighbour; width called out below the box
    const label = it.sku ?? it.label ?? (it.kind === "window" ? "WIN" : it.kind === "door" ? "DR" : "");
    if (label && h > 10) {
      doc.setTextColor("#1f2532");
      const horizFits = w > label.length * 4.2;
      if (horizFits) {
        doc.setFontSize(7);
        doc.text(label, x + w / 2, y + h / 2, { align: "center", baseline: "middle" });
      } else if (h > label.length * 4.2) {
        doc.setFontSize(6.5);
        doc.text(label, x + w / 2, y + h / 2, { align: "center", baseline: "middle", angle: 90 });
      } else {
        doc.setFontSize(5);
        doc.text(label, x + w / 2, y + h / 2, { align: "center", baseline: "middle" });
      }
    }
    // width dimension just under the box
    doc.setFontSize(6);
    doc.setTextColor(BRAND.steel);
    doc.text(`${Math.round(it.width)}"`, x + w / 2, Y(0) + 7, { align: "center" });
  }
}

function drawFootnote(doc: jsPDF, project: Project, catalog: Catalog, pricing: boolean, pageW: number, pageH: number): void {
  const finish = findFinish(catalog, project.settings.finishCode);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor("#666");
  const y = pageH - 26;
  doc.text(
    `Project: ${project.meta.name}  ·  Client: ${project.meta.client || "—"}  ·  ${project.meta.address || ""}  ·  ${project.meta.date}  ·  Job #${project.meta.jobNumber || "—"}`,
    24,
    y,
  );
  doc.text(
    `Finish: ${finish?.name ?? project.settings.finishCode} · Box: ${project.settings.boxMaterial === "PLY" ? "Plywood" : "Particle Board"}. Dimensions nominal; verify field measurements before ordering.${pricing ? ` Pricing per OPPEIN ${catalog._meta.pricing_year ?? 2025} list.` : ""}`,
    24,
    y + 10,
    { maxWidth: pageW - 48 },
  );
}

function drawSchedule(
  doc: jsPDF,
  project: Project,
  catalog: Catalog,
  mode: Mode,
  pageW: number,
  pricing: boolean,
): void {
  const lines = computeLines(
    project.items,
    catalog,
    project.settings.finishCode,
    project.settings.boxMaterial,
  );
  const totals = computeTotals(lines, catalog, project.settings);

  const headStyles = { fillColor: BRAND.indigo, textColor: "#ffffff", fontStyle: "bold" as const };

  // number of columns depends on mode + whether pricing is shown
  const colCount = !pricing ? 5 : mode === "internal" ? 8 : 6;

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
    body.push([{ content: cat, colSpan: colCount, styles: { fillColor: "#eef1f7", fontStyle: "bold" } } as unknown as string]);
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
      const base = [
        n,
        sample.item.sku ?? "",
        sample.product?.desc ?? "",
        itemDimsLabel(sample.item, sample.product),
        qty,
      ];
      if (!pricing) {
        body.push(base);
      } else if (mode === "internal") {
        body.push([...base, formatCAD(unitList), formatCAD(lineList), formatCAD(lineCost)]);
      } else {
        body.push([...base, formatCAD(lineClient)]);
      }
    }
  }

  const head: Row[] = !pricing
    ? [["#", "SKU", "Description", "Dims", "Qty"]]
    : mode === "internal"
      ? [["#", "SKU", "Description", "Dims", "Qty", "Unit List", "Line List", "JMRC Cost"]]
      : [["#", "SKU", "Description", "Dims", "Qty", "Line Price"]];

  const columnStyles: Record<number, { halign?: "right"; cellWidth?: number }> = !pricing
    ? { 0: { cellWidth: 28 }, 4: { halign: "right", cellWidth: 40 } }
    : mode === "internal"
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
        };

  let tablePage = 0;
  autoTable(doc, {
    startY: 92,
    head,
    body: body as unknown as (string | number)[][],
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles,
    columnStyles,
    margin: { top: 92, left: 24, right: 24, bottom: 40 },
    rowPageBreak: "avoid",
    didDrawPage: () => {
      tablePage += 1;
      // page 1 already has the title (drawn by exportProjectPdf); redraw it on
      // any overflow pages so a long schedule stays readable
      if (tablePage > 1) {
        drawTitleBlock(doc, project, mode, pageW, pricing, "Cabinet Schedule (cont.)");
      }
    },
  });

  let finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  // if the totals won't fit at the bottom of this page, start a fresh page
  if (pricing && finalY > doc.internal.pageSize.getHeight() - 90) {
    doc.addPage();
    drawTitleBlock(doc, project, mode, pageW, pricing, "Pricing summary");
    finalY = 100;
  }
  doc.setFontSize(9);
  doc.setTextColor("#222");
  const right = pageW - 24;
  const labelX = right - 220;
  let yy = finalY;
  const line = (k: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(k, labelX, yy, { align: "left" });
    doc.text(v, right, yy, { align: "right" });
    yy += 12;
  };
  if (pricing && mode === "internal") {
    line("Subtotal (MSRP/list)", formatCAD(totals.subtotalList));
    line(
      `Dealer discount (${Math.round(catalog._meta.dealer_discount * 100)}%)`,
      `- ${formatCAD(totals.dealerDiscount)}`,
    );
    line("JMRC cost", formatCAD(totals.jmrcCost), true);
    line("Client price", formatCAD(totals.clientSubtotal));
    line(
      `Margin ${totals.achievedMarginPct.toFixed(1)}% · Disc off MSRP ${totals.achievedDiscountPct.toFixed(1)}%`,
      "",
    );
    line(`HST (${Math.round(totals.hstRate * 100)}%)`, formatCAD(totals.hst));
    line("Client total", formatCAD(totals.clientTotal), true);
  } else if (pricing) {
    line("Subtotal", formatCAD(totals.clientSubtotal));
    line(`HST (${Math.round(totals.hstRate * 100)}%)`, formatCAD(totals.hst));
    line("Total (CAD)", formatCAD(totals.clientTotal), true);
  }
}
