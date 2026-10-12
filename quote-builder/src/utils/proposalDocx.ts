import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageBreak, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TabStopType, TextRun, WidthType,
} from "docx";
import type { PricedLine, Quote, Settings, Totals } from "../types";
import { PROJECT_TYPE_LABEL } from "../types";
import { roomGeometry } from "../engine/takeoff";

// Exports a quote in JMRC's standard document formats:
//  - Renovations / remodels → the REN "RENOVATION QUOTATION" (Munana format,
//    jmrc-renovation-quote): header with logo, project info table, 1 Scope,
//    2 Material Schedule, 3 Price, 4 Inclusions, 5 Exclusions, 6 Terms,
//    7 Acceptance. Direct-to-client or insurance variant.
//  - Shops / custom homes → the CUS custom-home proposal (Dunlop format,
//    jm-robins-custom-home-proposal): cover, 1 Project Overview, 2 Scope of
//    Work, 3 Allowances, 4 Exclusions, 5 Terms & Conditions, 6 Acceptance.
//    Lump-sum price only — no line-item pricing on the client copy.

const PAGE_W = 12240, PAGE_H = 15840;

const money = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
const longDate = (d = new Date()) => d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
const lines = (s: string) => s.split(/\n+/).map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
const lastName = (n: string) => (n.trim().split(/\s+/).pop() || "Client").replace(/[^A-Za-z0-9-]/g, "");

export function fileName(q: Quote) {
  const nb = q.type === "shop" || q.type === "custom-home";
  const kind = nb ? "Proposal" : "Renovation_Quote";
  return `JMRC_${kind}_${q.number || "DRAFT"}_${lastName(q.answers.clientName)}_V${q.version}.docx`;
}

async function logo(): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}jmrc-logo.png`);
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/* ============================ REN quotation ============================ */

const R = { indigo: "2C327C", cyan: "49C1C4", ink: "333333", gray: "777777", off: "F5F5F5", line: "CCCCCC" };
const rRun = (text: string, o: Record<string, unknown> = {}) => new TextRun({ text, font: "Montserrat", size: 20, color: R.ink, ...o });
const thin = { style: BorderStyle.SINGLE, size: 4, color: R.line };
const borders = { top: thin, bottom: thin, left: thin, right: thin };

function rCell(children: (TextRun | string)[], width: number, o: { fill?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; color?: string; span?: number } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: o.span,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders,
    children: [new Paragraph({ alignment: o.align, children: children.map((c) => (typeof c === "string" ? rRun(c, { bold: o.bold, color: o.color }) : c)) })],
  });
}

function rHeading(n: number, text: string) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: R.cyan, space: 2 } },
    children: [rRun(`${n}.  ${text}`, { bold: true, size: 26, color: R.indigo })],
  });
}
const rBody = (text: string, o: Record<string, unknown> = {}) => new Paragraph({ spacing: { before: 60, after: 60 }, children: [rRun(text, o)] });
const rBullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { before: 30, after: 30 }, children: [rRun(text)] });

function roomScope(q: Quote): Paragraph[] {
  const out: Paragraph[] = [];
  for (const r of q.answers.rooms) {
    const g = roomGeometry(r);
    const bits: string[] = [];
    if (r.demoWalls) bits.push("gut to studs");
    else if (r.demoFloor) bits.push("remove existing flooring");
    if (r.wallsRemovedLF) bits.push(`remove ${r.wallsRemovedLF} LF of wall${r.loadBearingRemoved ? " (bearing — new engineered beam)" : ""}`);
    if (r.newWallsLF) bits.push(`frame ${r.newWallsLF} LF of new wall`);
    if (r.drywall === "walls+ceiling") bits.push("new drywall on walls and ceiling");
    else if (r.drywall === "walls") bits.push("new drywall on walls");
    else if (r.drywall === "patch") bits.push("drywall repairs");
    if (r.floor === "flooring") bits.push("supply & install new flooring");
    if (r.floor === "tile") bits.push("supply & install floor tile");
    if (r.cabinetLF) bits.push(`${r.cabinetLF} LF of cabinetry`);
    if (r.countertopSF) bits.push("countertops");
    if (r.backsplashSF) bits.push("tile backsplash");
    if (r.tubShower === "tub") bits.push("new tub");
    if (r.tubShower === "shower") bits.push("new shower");
    if (r.showerWallTileSF) bits.push("waterproofed, tiled shower walls");
    if (r.vanity) bits.push("vanity & faucet");
    if (r.toilet) bits.push("toilet");
    if (r.plumbingRelocated) bits.push("relocate plumbing");
    if (r.newInteriorDoors) bits.push(`${r.newInteriorDoors} new interior door${r.newInteriorDoors > 1 ? "s" : ""}`);
    if (r.baseboard) bits.push("new baseboard");
    if (r.paintWalls || r.paintCeiling) bits.push(`paint ${[r.paintWalls && "walls", r.paintCeiling && "ceiling"].filter(Boolean).join(" & ")}`);
    if (r.lightFixtures) bits.push(`${r.lightFixtures} light fixture${r.lightFixtures > 1 ? "s" : ""}`);
    out.push(new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [rRun(`${r.name} (${g.L}' × ${g.W}') —  `, { bold: true }), rRun(bits.length ? bits.join("; ") + "." : "as noted.")],
    }));
    if (r.notes.trim()) out.push(rBody(r.notes.trim(), { italics: true, color: R.gray }));
  }
  return out;
}

// Client-facing products: finish materials that were selected or matched,
// not framing lumber and screws.
const SCHEDULE_SECTIONS = ["Flooring", "Tile", "Kitchen", "Bathroom", "Interior Finish", "Electrical", "Paint"];

function scheduleRows(q: Quote, priced: PricedLine[]) {
  const rooms = new Map(q.answers.rooms.map((r) => [r.id, r.name]));
  const groups = new Map<string, { product: string; areas: Set<string>; qty: number; unit: string }>();
  for (const l of priced) {
    if (l.kind !== "material" || !SCHEDULE_SECTIONS.includes(l.section)) continue;
    if (/handle|primer|thinset|grout|membrane|underlay|casing|baseboard/i.test(l.toolKey || "")) continue;
    const product = l.description.includes(" — ") ? l.description.split(" — ").slice(1).join(" — ") : l.description;
    const roomId = l.id.split("@")[1]?.split("#")[0];
    const area = roomId ? rooms.get(roomId) || "" : "Throughout";
    const key = `${product}|${l.unit}`;
    const g = groups.get(key) || { product, areas: new Set<string>(), qty: 0, unit: l.unit };
    g.areas.add(area);
    g.qty += l.qty;
    groups.set(key, g);
  }
  return [...groups.values()];
}

function standardInclusions(q: Quote): string[] {
  const party = q.answers.clientType === "insurance" ? q.answers.tpa || "the TPA" : "the Owner";
  return [
    "All products listed in Section 2 — supplied and installed at the project site",
    "All installation materials, underlays, adhesives, setting materials, transitions and fasteners required to complete the scope",
    "Installation labour for all areas in scope",
    "Site protection, daily cleanup and removal of construction debris",
    `Coordination with ${party}'s project schedule`,
    "Manufacturer warranties remain in effect provided products are installed per manufacturer instructions",
    ...lines(q.answers.inclusionsExtra),
  ];
}

function standardExclusions(q: Quote, isNew: boolean): string[] {
  if (isNew) {
    return [
      "Landscaping, grading beyond the building footprint, and topsoil",
      "Driveway and parking area",
      "Detached structures not shown on the approved drawing set",
      "Appliances (refrigerator, stove, dishwasher, washer, dryer)",
      "Window coverings and curtain rods",
      "Furniture and owner-supplied items",
      "Survey and legal fees",
      "Geotechnical or environmental assessments",
      "Any work not explicitly described in Section 2 or listed in Section 3",
      ...lines(q.answers.exclusionsExtra),
    ];
  }
  const r = q.answers.rooms;
  return [
    ...(r.some((x) => x.demoFloor || x.demoWalls) ? [] : ["Tearout and disposal of existing materials"]),
    "Subfloor / substrate preparation, levelling, or moisture remediation beyond what is described in Section 1",
    "Concealed conditions (rot, mould, asbestos, non-compliant wiring or plumbing) found once work begins — quoted as a written extra",
    "Appliances, window coverings and owner-supplied items",
    "Any work not explicitly described in this quotation",
    ...lines(q.answers.exclusionsExtra),
  ];
}

function renTerms(q: Quote, s: Settings): [string, string][] {
  const ins = q.answers.clientType === "insurance";
  const contract = ins
    ? `All work performed under this quote is subject to ${q.answers.tpa || "the TPA"}'s standard supplier / vendor agreement, tender requirements, and billing protocol.`
    : `All work performed under this quote is subject to ${s.company.name} standard terms and conditions.`;
  const t: [string, string][] = [
    ["Contract terms", contract],
    ["Pricing validity", "30 days from quote date. After 30 days, pricing subject to re-quote based on manufacturer cost at time of order."],
    ["Lead times", `In-stock products typically ship within 5–7 business days from PO. Install scheduled to coordinate with ${ins ? q.answers.tpa || "the TPA" : "the Owner"}'s project timeline.`],
    ["Changes", "Any scope or product changes after PO submitted as written extras prior to ordering or commencement of work."],
    ["Trust / Lien rights", "Per New Brunswick Construction Remedies Act."],
  ];
  if (!ins) {
    const cabinets = q.answers.rooms.some((r) => r.cabinetLF > 0);
    t.splice(1, 0, ["Payment", cabinets ? "50% deposit on order, balance Net 7 from completion." : "Net 30 from completion, or as agreed in writing."]);
    t.push(["Warranty", "1 year on labour from completion; manufacturer warranty applies to materials."]);
  }
  return t;
}

async function renovationDoc(q: Quote, s: Settings, priced: PricedLine[], totals: Totals, img: ArrayBuffer | null) {
  const a = q.answers;
  const ins = a.clientType === "insurance";
  const W = PAGE_W - 2 * 1440;
  const date = longDate();

  const header = new Header({
    children: [
      ...(img ? [new Paragraph({ children: [new ImageRun({ type: "png", data: img, transformation: { width: 230, height: 56 } })] })] : [new Paragraph({ children: [rRun(s.company.name, { bold: true, size: 28, color: R.indigo })] })]),
      new Paragraph({ spacing: { before: 60 }, children: [rRun(`${s.company.address}   |   Tel: ${s.company.phone}`, { size: 16, color: R.gray })] }),
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: R.cyan, space: 4 } }, children: [rRun("", { size: 4 })] }),
    ],
  });
  const footRef = ins
    ? `Quote ${q.number || "DRAFT"}  |  ${a.tpaFile ? `TPA File ${a.tpaFile}  |  ` : ""}${a.claimNo ? `Claim #${a.claimNo}   |   ` : ""}${s.company.name}`
    : `Quote ${q.number || "DRAFT"}  |  ${lastName(a.clientName)} — ${a.siteAddress.split(",")[0] || ""}   |   ${s.company.name}`;
  const footer = new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: W }],
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: R.line, space: 4 } },
      children: [rRun(footRef, { size: 16, color: R.gray }), rRun("\tPage ", { size: 16, color: R.gray }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Montserrat", size: 16, color: R.gray }), rRun(" of ", { size: 16, color: R.gray }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Montserrat", size: 16, color: R.gray })],
    })],
  });

  const info: [string, string][] = [
    ["Quote No.", q.number || "DRAFT"], ["Quote Date", date], ["Client", a.clientName], ["Property", a.siteAddress],
    ["Scope", a.scopeSummary || PROJECT_TYPE_LABEL[q.type]], ["Quote Valid", "30 days from issue"],
  ];
  const insInfo: [string, string][] = [
    ["Claim No.", a.claimNo], ["TPA File", a.tpaFile], ["Insurer", a.insurer], ["TPA", a.tpa], ["Estimator", a.estimator], ["", ""],
  ];
  const labelled = (l: string, v: string) => (l ? [rRun(l, { bold: true }), rRun(`   ${v || ""}`)] : [rRun("")]);
  const infoTable = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: ins ? [W / 2, W / 2] : [W],
    rows: [
      new TableRow({ children: ins
        ? [rCell(["PROJECT INFORMATION"], W / 2, { fill: R.indigo, bold: true, color: "FFFFFF" }), rCell(["INSURANCE / CARRIER"], W / 2, { fill: R.indigo, bold: true, color: "FFFFFF" })]
        : [rCell(["PROJECT INFORMATION"], W, { fill: R.indigo, bold: true, color: "FFFFFF" })] }),
      ...info.map(([l, v], i) => new TableRow({ children: ins
        ? [rCell(labelled(l, v), W / 2, { fill: i % 2 ? R.off : "FFFFFF" }), rCell(labelled(insInfo[i][0], insInfo[i][1]), W / 2, { fill: i % 2 ? R.off : "FFFFFF" })]
        : [rCell(labelled(l, v), W, { fill: i % 2 ? R.off : "FFFFFF" })] })),
    ],
  });

  const rows = scheduleRows(q, priced);
  const cw = [W * 0.5, W * 0.3, W * 0.2];
  const schedule = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: cw,
    rows: [
      new TableRow({ tableHeader: true, children: ["Product", "Coverage Area", "Quantity"].map((h, i) => rCell([h], cw[i], { fill: R.indigo, bold: true, color: "FFFFFF", align: i === 2 ? AlignmentType.RIGHT : undefined })) }),
      ...(rows.length ? rows : [{ product: "Per scope above", areas: new Set(["—"]), qty: 0, unit: "" }]).map((r) => new TableRow({ children: [
        rCell([r.product], cw[0]), rCell([[...r.areas].join(", ")], cw[1]), rCell([r.qty ? `${r.qty.toLocaleString("en-CA")} ${r.unit}` : ""], cw[2], { align: AlignmentType.RIGHT }),
      ] })),
    ],
  });

  const pw = [W * 0.7, W * 0.3];
  const priceTable = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: pw,
    rows: [
      new TableRow({ children: [rCell(["Subtotal (ex. HST)"], pw[0]), rCell([money(totals.subtotal)], pw[1], { align: AlignmentType.RIGHT })] }),
      new TableRow({ children: [rCell([`HST (${Math.round(s.pricing.hst * 100)}%)`], pw[0]), rCell([money(totals.hst)], pw[1], { align: AlignmentType.RIGHT })] }),
      new TableRow({ children: [
        rCell([ins ? "ALL MATERIALS, INSTALLATION MATERIALS, AND LABOUR PER TENDER REQUIREMENTS  (incl. HST)" : "TOTAL CONTRACT PRICE  (incl. HST)"], pw[0], { fill: R.indigo, bold: true, color: "FFFFFF" }),
        rCell([rRun(money(totals.total), { bold: true, size: 24, color: "FFFFFF" })], pw[1], { fill: R.indigo, align: AlignmentType.RIGHT }),
      ] }),
    ],
  });

  const sw = [W / 2, W / 2];
  const sigLeft = ins ? `${(a.tpa || "TPA").toUpperCase()} / INSURER` : "OWNER ACCEPTANCE";
  const sig = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: sw,
    rows: [
      new TableRow({ children: [rCell([sigLeft], sw[0], { fill: R.indigo, bold: true, color: "FFFFFF" }), rCell([s.company.name.toUpperCase()], sw[1], { fill: R.indigo, bold: true, color: "FFFFFF" })] }),
      ...[["Signature: _____________________", "Signature: _____________________"], ["Printed Name: __________________", `Printed Name: ${s.company.signer}`], ["Date: __________________________", `Title: ${s.company.signerTitle}`], ["", `Date: ${date}`]]
        .map(([l, r]) => new TableRow({ children: [rCell([l], sw[0]), rCell([r], sw[1])] })),
    ],
  });

  const summary = a.scopeSummary
    ? `${s.company.name} proposes to complete the following ${a.scopeSummary.charAt(0).toLowerCase() + a.scopeSummary.slice(1)} for ${a.clientName || "the Owner"} at ${a.siteAddress || "the property"}${ins ? `, under ${a.tpa || "the TPA"}'s restoration scope` : ""}.`
    : `${s.company.name} proposes to complete the following ${PROJECT_TYPE_LABEL[q.type].toLowerCase()} work for ${a.clientName || "the Owner"} at ${a.siteAddress || "the property"}.`;

  return new Document({
    creator: s.company.name,
    title: `${q.number} ${a.clientName}`,
    styles: { default: { document: { run: { font: "Montserrat", size: 20, color: R.ink } } } },
    numbering: { config: [] },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 1440, bottom: 1200, left: 1440, right: 1440, header: 500, footer: 500 } } },
      headers: { default: header },
      footers: { default: footer },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [rRun("RENOVATION QUOTATION", { bold: true, size: 44, color: R.indigo })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [rRun(ins ? "Insurance Restoration  —  Supply & Install" : "Supply & Install", { size: 22 })] }),
        infoTable,
        rHeading(1, "Scope"),
        rBody(summary),
        ...roomScope(q),
        rHeading(2, "Material Schedule"),
        schedule,
        rBody("Quantities include manufacturer-recommended waste factors. Final counts confirmed at install.", { italics: true, color: R.gray, size: 18 }),
        rHeading(3, "Price"),
        priceTable,
        rHeading(4, "Inclusions"),
        ...standardInclusions(q).map(rBullet),
        rHeading(5, "Exclusions"),
        ...standardExclusions(q, false).map(rBullet),
        rHeading(6, "Terms"),
        ...renTerms(q, s).map(([l, t]) => new Paragraph({ spacing: { before: 60, after: 60 }, children: [rRun(`${l}: `, { bold: true }), rRun(t)] })),
        rHeading(7, "Acceptance"),
        sig,
      ],
    }],
  });
}

/* ============================ CUS proposal ============================ */

const C = { navy: "1F3864", blue: "2E75B6", light: "BDD7EE", pale: "DEEAF1", gray: "595959", black: "000000" };
const cRun = (text: string, o: Record<string, unknown> = {}) => new TextRun({ text, font: "Arial", size: 20, color: C.black, ...o });
const cH1 = (text: string) => new Paragraph({ keepNext: true, spacing: { before: 300, after: 120 }, children: [cRun(text.toUpperCase(), { bold: true, size: 24, color: C.navy })] });
const cH2 = (text: string) => new Paragraph({ keepNext: true, spacing: { before: 200, after: 80 }, children: [cRun(text, { bold: true, size: 22, color: C.blue })] });
const cBody = (text: string, o: Record<string, unknown> = {}) => new Paragraph({ spacing: { before: 60, after: 60 }, children: [cRun(text, o)] });
const cBullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { before: 20, after: 20 }, children: [cRun(text)] });
const cBorder = { style: BorderStyle.SINGLE, size: 2, color: "AAAAAA" };
const cBorders = { top: cBorder, bottom: cBorder, left: cBorder, right: cBorder };
function cCell(text: string | TextRun[], width: number, o: { fill?: string; bold?: boolean; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; span?: number } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, columnSpan: o.span,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 }, borders: cBorders,
    children: [new Paragraph({ alignment: o.align, children: typeof text === "string" ? [cRun(text, { bold: o.bold, color: o.color })] : text })],
  });
}

const FOUNDATION_TEXT: Record<string, string> = {
  slab: "Slab-on-grade, minimum 4\" thick (25 MPa or per drawings), with monolithic footings per structural drawings.",
  "frost-wall": "Frost wall foundation with concrete slab-on-grade, per structural drawings.",
  "basement-icf": "ICF (insulated concrete form) basement walls on concrete footings, with concrete basement slab, per structural drawings.",
  existing: "Work proceeds on the existing foundation as shown on the drawings.",
};

function scopeOfWork(q: Quote): [string, string[]][] {
  const a = q.answers;
  const shop = q.type === "shop";
  const studs = a.wallHeight <= 8 ? "92-5/8\" precut studs" : `${a.wallHeight}' walls`;
  const out: [string, string[]][] = [
    ["Site Preparation & Foundation Work", ["Mobilization, layout and site protection", "Excavation and grading as required within the building footprint", FOUNDATION_TEXT[a.foundation]]],
    ["Framing", [
      `2×6 exterior walls @ 16" o.c. (${studs}), single bottom plate and double top plate`,
      ...(a.interiorWallLF ? ["2×4 interior partitions @ 16\" o.c."] : []),
      `Engineered roof trusses at ${a.roofPitch}/12 pitch per the truss package`,
      "7/16\" OSB wall sheathing and approved house wrap",
      ...(a.storeys > 1 ? ["Engineered floor system with 23/32\" T&G OSB subfloor"] : []),
      "All headers and beams per drawings",
    ]],
    ["Windows & Exterior Doors", [
      `Supply and install ${a.windowCount} window${a.windowCount === 1 ? "" : "s"} and ${a.extDoorCount} exterior door${a.extDoorCount === 1 ? "" : "s"} per the door & window schedule`,
      ...(shop && a.overheadDoorCount ? [`${a.overheadDoorCount} overhead door${a.overheadDoorCount > 1 ? "s" : ""}, ${a.overheadDoorW}' × ${a.overheadDoorH}'`] : []),
      "Window rough openings per manufacturer drawings",
    ]],
    ["Roofing", ["19/32\" T&G OSB roof sheathing", "Architectural asphalt shingles with synthetic underlay; ice & water shield at eaves and valleys", "Drip edge, ridge vent, soffits and fascia"]],
  ];
  if (!shop || a.insulated) out.push(["Insulation & Air Barrier", ["R-22 batt insulation in 2×6 exterior walls", "R-60 blown-in attic insulation", "6 mil vapour barrier, sealed, on the warm side"]]);
  if (!shop || a.interiorFinish === "drywall") out.push(["Interior Finishes — Drywall", [shop ? "5/8\" Type X drywall, taped and finished" : "1/2\" drywall throughout, taped, mudded and ready for paint"]]);
  else if (a.interiorFinish === "osb") out.push(["Interior Liner", ["7/16\" OSB interior wall liner"]]);
  if (!shop) {
    out.push(
      ["Interior Doors & Trim", [`Supply and install ${a.interiorDoorCount} prehung interior doors with hardware`, "Primed MDF baseboard and casing"]],
      ["Cabinetry & Countertops", ["Kitchen and bathroom cabinetry per the cabinet drawings; countertops per allowance (Section 3)", "Crown, toe kick, fillers and trim included"]],
      ["Flooring & Tile", ["Supply and install flooring and tile per allowance and client selections (Section 3)", "Waterproofed, tiled shower walls where shown"]],
      ["Plumbing", ["Rough-in and finish plumbing per drawings; fixtures per allowance and client selections (Section 3)"]],
    );
  } else if (a.bathroomCount) out.push(["Plumbing", ["Rough-in and finish plumbing for the washroom per drawings"]]);
  out.push(["Electrical", [shop ? "Electrical service, rough-in and finish per drawings and code" : "200A panel, all rough-in and finish electrical per drawings and code; smoke and CO detectors as required"]]);
  const heat = { none: "", baseboard: "Electric baseboard heat", "mini-split": "Mini-split heat pump supply and install", "forced-air": "Forced-air heating system" }[a.heating];
  if (heat && (!shop || a.insulated)) out.push(["HVAC", [heat, ...(shop ? [] : ["HRV / ventilation as required by the NB Building Code"])]]);
  out.push(["Exterior Finishes", [`${{ vinyl: "Vinyl", engineered: "Engineered wood", steel: "Steel" }[a.siding]} siding with trims, corners and J-channel`, "Soffit and fascia"]]);
  if (!shop || a.interiorFinish === "drywall") out.push(["Painting", ["One prime coat + two finish coats, interior walls; ceilings primed and painted"]]);
  out.push(["Cleanup & Waste Disposal", ["Ongoing site cleanup throughout construction", "Final clean prior to handover", "Waste disposal per allowance (Section 3)"]]);
  return out;
}

// Allowance rows: client-selection and site-dependent items at cost
// (material / subcontractor cost only — labour is in the fixed price).
function allowanceRows(priced: PricedLine[]) {
  const map = new Map<string, number>();
  for (const l of priced) {
    if (!l.allowance && l.kind !== "allowance") continue;
    const label = l.kind === "material" ? l.section === "Electrical" ? "Lighting Fixtures" : l.section === "Bathroom" ? "Plumbing Fixtures — Bathrooms" : l.section === "Kitchen" ? `Kitchen — ${l.description.split(" — ")[0]}` : `${l.section}` : l.description.split(" — ")[0];
    const clean = label.replace(/\s*\((if no|no )[^)]*\)/gi, "").replace(/\s+allowance\b/i, "").trim();
    map.set(clean, (map.get(clean) || 0) + l.extCost);
  }
  return [...map.entries()];
}

async function newBuildDoc(q: Quote, s: Settings, priced: PricedLine[], totals: Totals, img: ArrayBuffer | null) {
  const a = q.answers;
  const W = PAGE_W - 2 * 1080;
  const date = longDate();
  const kindLabel = q.type === "shop" ? "SHOP CONSTRUCTION PROPOSAL" : "CUSTOM HOME CONSTRUCTION PROPOSAL";
  const residence = `${lastName(a.clientName).toUpperCase()} ${q.type === "shop" ? "SHOP" : "RESIDENCE"}`;
  const floorArea = a.length * a.width * (a.storeys || 1);

  const header = new Header({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: W }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.gray, space: 4 } },
    children: [cRun(`${residence} – ${kindLabel.replace(/ PROPOSAL$/, "").replace(/(\w)(\w*)/g, (_m, x, y) => x + y.toLowerCase())} Proposal | V${q.version}`, { size: 16, color: C.gray }), cRun(`\t${s.company.name}`, { size: 16, color: C.gray })],
  })] });
  const footer = new Footer({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: W }],
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.gray, space: 4 } },
    children: [cRun(`${a.siteAddress} | ${a.clientName}`, { size: 16, color: C.gray }), cRun("\tPage ", { size: 16, color: C.gray }),
      new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: C.gray }), cRun(" of ", { size: 16, color: C.gray }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: C.gray })],
  })] });

  const rule = () => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.navy, space: 4 } }, children: [] });
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: none, bottom: none, left: none, right: none };
  const cover = [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: W }],
      children: [
        ...(img ? [new ImageRun({ type: "png", data: img, transformation: { width: 210, height: 51 } })] : [cRun(s.company.name, { bold: true, size: 24, color: C.navy })]),
        cRun(`\t${kindLabel}`, { bold: true, size: 20, color: C.navy }),
      ],
    }),
    rule(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [cRun(residence, { bold: true, size: 48, color: C.navy })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [cRun(a.siteAddress, { size: 22, color: C.gray })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [cRun(a.clientName, { size: 22, color: C.gray })] }),
    rule(),
    new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: [W / 3, W / 3, W / 3],
      rows: [new TableRow({ children: [`Proposal No.:  ${q.number || "DRAFT"}`, `Date:  ${date}`, `Version:  V${q.version}`].map((t) => new TableCell({
        width: { size: W / 3, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [cRun(t, { bold: true })] })],
      })) })],
    }),
    new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: [W / 2, W / 2],
      rows: [new TableRow({ children: [
        new TableCell({ width: { size: W / 2, type: WidthType.DXA }, borders: noBorders, children: [cBody("Prepared for", { bold: true, color: C.navy }), cBody(a.clientName), cBody(a.siteAddress)] }),
        new TableCell({ width: { size: W / 2, type: WidthType.DXA }, borders: noBorders, children: [cBody("Prepared by", { bold: true, color: C.navy }), cBody(s.company.name), cBody(s.company.address), cBody(`Tel: ${s.company.phone}`)] }),
      ] })],
    }),
    cBody(`This proposal is confidential and prepared exclusively for ${a.clientName || "the Owner"}. Pricing and scope are valid for 30 days from the date above.`, { italics: true, size: 16, color: C.gray }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const kv = (rows: [string, string][]) => new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W * 0.35, W * 0.65],
    rows: [
      new TableRow({ children: [cCell("Parameter", W * 0.35, { fill: C.navy, bold: true, color: "FFFFFF" }), cCell("Value", W * 0.65, { fill: C.navy, bold: true, color: "FFFFFF" })] }),
      ...rows.map(([k, v], i) => new TableRow({ children: [cCell(k, W * 0.35, { bold: true, fill: i % 2 ? C.pale : undefined }), cCell(v, W * 0.65, { fill: i % 2 ? C.pale : undefined })] })),
    ],
  });

  const allowances = allowanceRows(priced);
  const aw = [W * 0.1, W * 0.65, W * 0.25];
  const allowTable = new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: aw,
    rows: [
      new TableRow({ tableHeader: true, children: ["#", "Item", "Allowance"].map((h, i) => cCell(h, aw[i], { fill: C.navy, bold: true, color: "FFFFFF", align: i === 2 ? AlignmentType.RIGHT : undefined })) }),
      ...allowances.map(([label, amt], i) => new TableRow({ children: [
        cCell(`3.${i + 1}`, aw[0], { fill: i % 2 ? C.pale : undefined }), cCell(label, aw[1], { fill: i % 2 ? C.pale : undefined }),
        cCell(amt > 0 ? money(Math.round(amt)) : "TBD", aw[2], { align: AlignmentType.RIGHT, fill: i % 2 ? C.pale : undefined }),
      ] })),
    ],
  });

  const draws = lines(s.terms?.paymentScheduleNewBuild || "");
  const tc: [string, string[]][] = [
    ["5.1 Contract Price", [`The contract price is ${money(totals.subtotal)} plus applicable HST (${Math.round(s.pricing.hst * 100)}%), for a total of ${money(totals.total)}. This is a fixed-price contract; the Owner will not pay more than this amount for the scope described in Section 2, except through written change orders or allowance reconciliation per Section 3.`]],
    ["5.2 Payment Schedule", draws.length ? draws : ["Milestone draws (deposit, foundation, framing, rough-ins, drywall, substantial completion, holdback release) as agreed in writing before signing."]],
    ["5.3 Statutory Holdback (CRA)", ["A statutory holdback of 10% of each progress payment will be retained by the Owner in accordance with the New Brunswick Construction Remedies Act (CRA). The holdback is released 45 days after substantial completion, provided no liens have been registered against the property."]],
    ["5.4 Lien Rights", ["Subcontractors and suppliers retain lien rights under the New Brunswick Construction Remedies Act."]],
    ["5.5 Trust Provisions", [`All funds received by ${s.company.name} in connection with this contract are impressed with a trust in favour of subcontractors and suppliers as required by the New Brunswick Construction Remedies Act.`]],
    ["5.6 Change Orders", ["Any changes to scope, materials, or finishes beyond this proposal require a written change order signed by both parties prior to execution. Verbal agreements are not binding."]],
    ["5.7 Allowance Reconciliation", ["Allowances in Section 3 represent estimated costs. Upon project completion, each allowance will be reconciled to actual invoiced costs. Overages are invoiced to the Owner; underages are credited. No changes to labour are involved."]],
    ["5.8 Warranty", [`${s.company.name} warrants workmanship under the Lux Atlantic Residential Warranty Program.`]],
    ["5.9 Exclusive Purchasing", ["All cabinetry, cabinet hardware, countertops, stone products, flooring, tile, and lighting fixtures must be purchased exclusively through Robins Interiors and Designs. Substitution of alternate suppliers requires written approval and may result in a change order."]],
    ["5.10 Material Price Escalation", [`Material prices are based on current market rates as of the proposal date. If the project start is delayed beyond 90 days, ${s.company.name} reserves the right to adjust material pricing via written amendment.`]],
  ];

  const sw = [W / 2, W / 2];
  const sig = new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: sw,
    rows: [
      new TableRow({ children: [cCell("OWNER ACCEPTANCE", sw[0], { fill: C.navy, bold: true, color: "FFFFFF" }), cCell(s.company.name.toUpperCase(), sw[1], { fill: C.navy, bold: true, color: "FFFFFF" })] }),
      ...[["I/We have read and agree to the terms of this proposal.", "Accepted by:"], ["Signature: _________________________", "Signature: _________________________"], ["Printed Name: ______________________", `Printed Name: ${s.company.signer}`], ["Date: _____________________________", "Date: _____________________________"], ["", `Title: ${s.company.signerTitle}`]]
        .map(([l, r]) => new TableRow({ children: [cCell(l, sw[0]), cCell(r, sw[1])] })),
    ],
  });

  return new Document({
    creator: s.company.name,
    title: `${q.number} ${residence}`,
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      { properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children: cover },
      {
        properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080, header: 500, footer: 500 } } },
        headers: { default: header },
        footers: { default: footer },
        children: [
          cH1("1. Project Overview"),
          cBody(`${s.company.name} will build a ${a.storeys > 1 ? "two-storey" : "single-storey"} ${q.type === "shop" ? "shop" : "custom home"} for ${a.clientName || "the Owner"} at ${a.siteAddress || "the site"}${a.scopeSummary ? ` — ${a.scopeSummary}` : ""}.`),
          kv([
            ["Project", `${residence.replace(/(\w)(\w*)/g, (_m, x, y) => x + y.toLowerCase())} — ${PROJECT_TYPE_LABEL[q.type]}`],
            ["Site Address", a.siteAddress],
            ["Owner", a.clientName],
            ["Build Type", `${a.storeys > 1 ? "Two" : "Single"}-storey, ${a.length}' × ${a.width}'`],
            ["Foundation", FOUNDATION_TEXT[a.foundation].replace(/\.$/, "")],
            ["Floor Area", `${floorArea.toLocaleString("en-CA")} sq ft (from dimensions)`],
            ["Proposal Date", date],
            ["Proposal Version", `V${q.version}`],
          ]),
          cH1("2. Scope of Work"),
          cBody("The following is included in the fixed contract price."),
          ...scopeOfWork(q).flatMap(([h, items], i) => [cH2(`2.${i + 1} ${h}`), ...items.map(cBullet)]),
          ...(lines(a.inclusionsExtra).length ? [cH2("Additional Inclusions"), ...lines(a.inclusionsExtra).map(cBullet)] : []),
          cH1("3. Allowance Items"),
          cBody("The following allowances represent estimated material and subcontractor costs for items requiring client selection or subject to site-specific conditions. All installation labour is included in the fixed contract price. Allowance amounts will be reconciled to actual costs at project completion; any overages are added via change order, and any savings are credited to the Owner. Flooring, tile, plumbing fixtures, cabinet hardware, and lighting are to be selected through Robins Interiors and Designs."),
          allowTable,
          cH1("4. Exclusions"),
          ...standardExclusions(q, true).map(cBullet),
          cH1("5. Terms & Conditions"),
          ...tc.flatMap(([h, body]) => [cH2(h), ...(body.length > 1 ? body.map(cBullet) : body.map((b) => cBody(b)))]),
          cH1("6. Acceptance"),
          new Table({
            width: { size: W, type: WidthType.DXA }, columnWidths: [W * 0.7, W * 0.3],
            rows: [
              new TableRow({ children: [cCell("Contract Price (ex. HST)", W * 0.7, { bold: true }), cCell(money(totals.subtotal), W * 0.3, { align: AlignmentType.RIGHT, bold: true })] }),
              new TableRow({ children: [cCell(`HST (${Math.round(s.pricing.hst * 100)}%)`, W * 0.7), cCell(money(totals.hst), W * 0.3, { align: AlignmentType.RIGHT })] }),
              new TableRow({ children: [cCell("TOTAL CONTRACT PRICE (incl. HST)", W * 0.7, { fill: C.navy, bold: true, color: "FFFFFF" }), cCell(money(totals.total), W * 0.3, { fill: C.navy, bold: true, color: "FFFFFF", align: AlignmentType.RIGHT })] }),
            ],
          }),
          new Paragraph({ spacing: { before: 200 }, children: [] }),
          sig,
          cBody("By signing above, both parties agree that this proposal, together with its Warranty Schedule and Terms & Conditions Schedule, constitutes the entire agreement between the parties.", { italics: true, size: 18, color: C.gray }),
        ],
      },
    ],
  });
}

export async function buildProposal(q: Quote, s: Settings, priced: PricedLine[], totals: Totals): Promise<Blob> {
  const img = await logo();
  const doc = q.type === "shop" || q.type === "custom-home"
    ? await newBuildDoc(q, s, priced, totals, img)
    : await renovationDoc(q, s, priced, totals, img);
  return Packer.toBlob(doc);
}

// Internal cost breakdown (never sent to the client).
export function costCsv(q: Quote, priced: PricedLine[], totals: Totals): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Section", "Kind", "Description", "Qty", "Unit", "Unit cost", "Ext. cost", "Markup %", "Sell", "Source", "How the quantity was worked out", "Flags"]];
  for (const l of priced) rows.push([l.section, l.kind, l.description, String(l.qty), l.unit, l.unitCost == null ? "" : l.unitCost.toFixed(2), l.extCost.toFixed(2), (l.markup * 100).toFixed(1), l.sell.toFixed(2), l.source, l.basis || "", l.flags.join("; ")]);
  rows.push([]);
  for (const [k, v] of [["Cost", totals.cost], ["Sell before fees", totals.sellBeforeFees], ["PM fee", totals.pmFee], ["Contingency", totals.contingency], ["Subtotal (ex. HST)", totals.subtotal], ["HST", totals.hst], ["Total", totals.total]] as const)
    rows.push(["", "", k, "", "", "", "", "", v.toFixed(2)]);
  rows.push(["", "", "Gross margin", "", "", "", "", "", `${(totals.margin * 100).toFixed(1)}%`]);
  return `Quote ${q.number || "DRAFT"} — ${q.answers.clientName}\n` + rows.map((r) => r.map(esc).join(",")).join("\n");
}
