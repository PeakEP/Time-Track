// Branded purchase order PDF for one vendor's weekly batch (JMRC brand standards:
// logo top left, indigo table headers, cyan rule, prices ex. HST + 15% HST).
import { jsPDF } from "jspdf";
import * as autoTableModule from "jspdf-autotable";

// The browser bundle and Node (tests) expose jspdf-autotable's function differently.
const autoTable = [autoTableModule.default, autoTableModule.default?.default, autoTableModule.autoTable]
  .find((f) => typeof f === "function");
import { TZ, coaName, lineTotal, money, poTotals } from "./logic.js";

const INDIGO = [44, 50, 124];
const CYAN = [73, 193, 196];
const CHARCOAL = [51, 51, 51];
const GREY = [119, 119, 119];
const LIGHT = [245, 245, 245];
const LINE = [204, 204, 204];

export const COMPANY = {
  name: "J.M Robins Construction Ltd.",
  division: "Robins Interiors & Design",
  address: "164 Park Street, Sussex, NB E4E 1V3",
  phone: "506-808-2711",
};

// lines: the batch's order lines. logo: optional PNG data URL (the JMRC logo).
// Returns the jsPDF document; call .save(name) in the browser.
export function buildPoPdf({ vendor, dayLabel, lines, issuedBy, logo, now = new Date() }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const issued = now.toLocaleDateString("en-CA", { timeZone: TZ, year: "numeric", month: "long", day: "numeric" });
  const pos = [...new Set(lines.map((o) => o.po).filter(Boolean))];
  const totals = poTotals(lines);

  // ---- header: logo left, title + company right, cyan rule
  if (logo) doc.addImage(logo, "PNG", M, M - 4, 180, 44, "jmrc-logo", "FAST");
  else {
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...CHARCOAL);
    doc.text(COMPANY.name, M, M + 20);
  }
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...INDIGO);
  doc.text("PURCHASE ORDER", W - M, M + 10, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GREY);
  doc.text(`${COMPANY.division} · ${COMPANY.name}`, W - M, M + 24, { align: "right" });
  doc.text(`${COMPANY.address}   |   Tel: ${COMPANY.phone}`, W - M, M + 36, { align: "right" });
  doc.setDrawColor(...CYAN).setLineWidth(1.5).line(M, M + 50, W - M, M + 50);

  // ---- order details
  const details = [
    ["Vendor", vendor],
    ["PO #", pos.join(", ") || "—"],
    ["Order day", dayLabel || "—"],
    ["Date issued", issued],
    ["Issued by", issuedBy || "—"],
    ["Lines", String(lines.length)],
  ];
  let y = M + 70;
  const colW = (W - 2 * M) / 3;
  details.forEach(([k, v], i) => {
    const x = M + (i % 3) * colW;
    const yy = y + Math.floor(i / 3) * 30;
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GREY).text(k.toUpperCase(), x, yy);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...CHARCOAL);
    doc.text(doc.splitTextToSize(String(v), colW - 12)[0], x, yy + 13);
  });
  y += 66;

  // ---- line items
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 44 },
    head: [["PO #", "Job", "Product", "SKU", "Description", "Cost code", "Qty", "Unit", "Need by", "Unit cost", "Line total"]],
    body: lines.map((o) => [
      o.po || "",
      o.jobCode || "",
      o.productName || "",
      o.sku || "",
      [o.description, o.notes && `Note: ${o.notes}`].filter(Boolean).join("\n"),
      o.coa ? `${o.coa}\n${coaName(o.coa)}` : "NEEDS CODE",
      String(o.qty ?? ""),
      o.unit || "",
      o.neededBy || "",
      money(o.cost),
      money(lineTotal(o)),
    ]),
    styles: { font: "helvetica", fontSize: 8.5, textColor: CHARCOAL, lineColor: LINE, lineWidth: 0.5, cellPadding: 4, valign: "top" },
    headStyles: { fillColor: INDIGO, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 52 },
      2: { cellWidth: 100 },
      3: { cellWidth: 58 },
      4: { cellWidth: "auto" },
      5: { cellWidth: 92 },
      6: { cellWidth: 34, halign: "right" },
      7: { cellWidth: 34 },
      8: { cellWidth: 54 },
      9: { cellWidth: 56, halign: "right" },
      10: { cellWidth: 62, halign: "right" },
    },
  });
  y = doc.lastAutoTable.finalY + 14;

  // ---- totals (right) and per-code subtotals (left)
  const need = 90;
  if (y + need > H - 44) {
    doc.addPage();
    y = M;
  }
  const tx = W - M - 220;
  const totalRows = [
    ["Subtotal (ex. HST)", money(totals.subtotal)],
    ["HST (15%)", money(totals.hst)],
    ["Total", money(totals.total)],
  ];
  totalRows.forEach(([k, v], i) => {
    const last = i === totalRows.length - 1;
    const yy = y + 12 + i * 16;
    if (last) doc.setDrawColor(...INDIGO).setLineWidth(1).line(tx, yy - 11, W - M, yy - 11);
    doc.setFont("helvetica", last ? "bold" : "normal").setFontSize(last ? 11 : 9.5).setTextColor(...(last ? INDIGO : CHARCOAL));
    doc.text(k, tx, yy);
    doc.text(v, W - M, yy, { align: "right" });
  });
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: W - tx + 24 },
    tableWidth: tx - M - 24,
    head: [["Cost code", "Account", "Subtotal (ex. HST)"]],
    body: totals.byCode.map((c) => [c.code || "—", c.code ? c.name : "Needs a cost code", money(c.amount)]),
    styles: { font: "helvetica", fontSize: 8, textColor: CHARCOAL, lineColor: LINE, lineWidth: 0.5, cellPadding: 3 },
    headStyles: { fillColor: INDIGO, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: { 0: { cellWidth: 56 }, 2: { cellWidth: 90, halign: "right" } },
  });

  // ---- footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GREY);
    doc.text(`Purchase Order – ${vendor} | ${issued}`, M, H - 22);
    doc.text(`Coded per OPS-POL-001 · ${COMPANY.name} · Page ${i} of ${pages}`, W - M, H - 22, { align: "right" });
  }
  return doc;
}

export const poFileName = (vendor, date) => `PO_${vendor.replace(/[^A-Za-z0-9]+/g, "_")}_${date}.pdf`;
