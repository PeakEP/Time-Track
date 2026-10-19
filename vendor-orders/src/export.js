// Binary PO exports: a vendor-ready PDF, and an .xlsx that matches Square's
// purchase-order import template. Browser-only (pulls in jsPDF / JSZip); the
// pure data shaping (squareMatrix, mdy, poFilename) lives in logic.js.
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import { money, lineTotal } from "./logic.js";

applyPlugin(jsPDF); // adds doc.autoTable(...)

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const colRef = (n) => {
  let s = "";
  let x = n + 1;
  while (x > 0) { s = String.fromCharCode(65 + ((x - 1) % 26)) + s; x = Math.floor((x - 1) / 26); }
  return s;
};
const xesc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// A worksheet with every value written as an inline string (the Square template
// stores Qty/Unit Cost as text too, so this matches it exactly).
function sheetXml(rows) {
  const body = rows
    .map((row, r) => {
      const cells = (row || [])
        .map((v, c) => (v === "" || v == null ? "" : `<c r="${colRef(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`))
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

// A minimal single-sheet .xlsx (OOXML package) from a 2D array of cell values.
export function xlsxBlob(rows, sheetName = "Sheet0") {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xesc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  zip.file("xl/worksheets/sheet1.xml", sheetXml(rows));
  return zip.generateAsync({ type: "blob", mimeType: XLSX_MIME, compression: "DEFLATE" });
}

// A vendor-facing PO PDF (no internal cost codes or rep names).
export function poPdfBlob({ vendor, orderDay, dateStr, poRefs, shipTo, notes, lines, generatedBy }) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const M = 40;
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(0).text("PURCHASE ORDER", M, 52);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0).text("Robins Interiors & Design", M, 72);
  doc.setFontSize(9).setTextColor(110).text("J.M Robins Construction Ltd.", M, 86);

  const rx = 360;
  let ry = 44;
  const meta = [["Vendor", vendor], ["Date", dateStr], ["Order day", orderDay]];
  if (shipTo) meta.push(["Ship to", shipTo]);
  if (poRefs) meta.push(["PO ref", poRefs]);
  doc.setFontSize(9);
  for (const [k, v] of meta) {
    doc.setTextColor(110).text(String(k), rx, ry);
    doc.setTextColor(0).text(String(v || ""), rx + 62, ry, { maxWidth: 515 - (rx + 62 - M) });
    ry += 15;
  }

  const sub = lines.reduce((s, o) => s + lineTotal(o), 0);
  doc.autoTable({
    startY: Math.max(110, ry + 12),
    head: [["PO #", "Product", "SKU", "Description", "Qty", "Unit", "Unit Cost", "Line Total"]],
    body: lines.map((o) => [o.po || "", o.productName || "", o.sku || "", o.description || "", String(o.qty == null ? "" : o.qty), o.unit || "", money(o.cost), money(lineTotal(o))]),
    foot: [[{ content: "Subtotal (ex. HST)", colSpan: 7, styles: { halign: "right" } }, money(sub)]],
    styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [44, 62, 80], textColor: 255 },
    footStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: "bold" },
    columnStyles: { 4: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
    margin: { left: M, right: M },
  });

  const y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 110) + 22;
  if (notes) doc.setFontSize(9).setTextColor(70).text("Notes: " + notes, M, y, { maxWidth: 515 });
  doc.setFontSize(8).setTextColor(140).text(`Generated ${dateStr}${generatedBy ? " by " + generatedBy : ""} · JMRC Vendor Orders`, M, 756);
  return new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
}
