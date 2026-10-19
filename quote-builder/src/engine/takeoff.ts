import { EXCLUDED, type Answers, type CabinetSet, type CatalogItem, type FloorType, type Line, type LineKind, type ProjectType, type Room, type Settings, type ToolComponent } from "../types";
import { priceCabinet, SUPPLIER_LABEL, type CabinetData } from "./cabinets";
import { itemLabel, resolveComponent } from "./catalog";
import { floorType } from "../data/questions";

// Takeoff: answers → quantity lines. Methods follow the JMRC takeoff standard
// (jmrc-material-takeoff): 16" o.c., 3-stud corners, 2 king + 2 jack per
// opening, single bottom + double top plate, sheathing gross with no opening
// deductions, insulation and drywall net, roof area by slope factor, 10%
// lumber/sheathing waste.

export const slopeFactor = (pitch: number) => Math.sqrt(1 + (pitch / 12) ** 2);
const ceil = (n: number) => Math.ceil(n - 1e-9);
const round2 = (n: number) => Math.round(n * 100) / 100;
const pos = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

export interface Ctx {
  type: ProjectType;
  answers: Answers;
  settings: Settings;
  items: CatalogItem[];
  byId: Map<string, CatalogItem>;
  cabinetSets?: CabinetSet[];
  cabinetData?: CabinetData;
  quoteRates?: Record<string, number>; // rates the rep entered on this quote
}

export class Takeoff {
  lines: Line[] = [];
  private seq = new Map<string, number>();
  constructor(private ctx: Ctx) {}

  private id(key: string) {
    const n = (this.seq.get(key) || 0) + 1;
    this.seq.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  }

  comp(key: string): ToolComponent {
    const c = this.ctx.settings.components.find((x) => x.key === key);
    if (!c) throw new Error(`Unknown takeoff tool: ${key}`);
    return c;
  }

  // A material from a takeoff tool. `need` is in takeoff units (SF, LF, EA…);
  // it's converted to catalog units with the tool's coverage and waste.
  // `selectedId` (from the Selections step) overrides the tool's catalog item.
  material(key: string, need: number, basis: string, opts: { selectedId?: string; label?: string; section?: string; allowance?: boolean; idKey?: string; codes?: string[]; match?: string[] } = {}) {
    need = round2(need);
    if (!(need > 0)) return;
    if (opts.selectedId === EXCLUDED) return; // "not included" — drop the line
    const comp = this.comp(key);
    const flags: string[] = [];
    let item: CatalogItem | null = null;
    let how = "none";
    const sel = opts.selectedId ? this.ctx.byId.get(opts.selectedId) : undefined;
    if (sel) { item = sel; how = "selected"; }
    else {
      // `codes` narrows the default product to a floor type's cost code.
      const rc = opts.codes ? { ...comp, codes: opts.codes, match: opts.match ?? comp.match } : comp;
      const r = resolveComponent(rc, this.ctx.byId, this.ctx.items);
      item = r.item; how = r.how;
      if (r.how === "matched" && r.alternatives > 0) flags.push("auto-matched");
    }
    if (!comp.coverageVerified && how !== "selected") flags.push("verify coverage");
    const coverage = (comp.coverage || 1) * (item && comp.section === "Paint" ? paintSize(item) : 1);
    const qty = ceil((need * (1 + comp.waste)) / coverage);
    const id = this.id(opts.idKey || key);
    const label = opts.label || comp.label;
    if (!item) flags.push("no catalog match");
    else if (item.unitCost == null) flags.push(asPerDrawings(item) ? "priced as per drawings" : "catalog item has no cost");
    this.lines.push({
      id,
      section: opts.section || comp.section,
      kind: "material",
      description: item ? `${label} — ${itemLabel(item)}` : label,
      qty,
      unit: item?.unit || "EA",
      unitCost: item?.unitCost ?? null,
      source: item ? (item.unitCost == null ? "unpriced" : item.source === "square" ? "square" : "catalog") : "unpriced",
      catalogItemId: item?.id,
      costCode: item?.costCode,
      toolKey: key,
      basis: `${basis} = ${fmt(need)}${comp.waste ? ` + ${Math.round(comp.waste * 100)}% waste` : ""}${coverage !== 1 ? ` ÷ ${fmt(coverage)} (${comp.coverageNote})` : ""}`,
      flags,
      allowance: opts.allowance,
    });
  }

  // A finished floor of the given type: the right material (priced within the
  // type's cost code, or the product picked on the Products step) plus its
  // install labour. Tile floors also get thinset + grout; the rest get underlay.
  floor(type: FloorType, sf: number, basis: string, idKey: string, tag = "") {
    sf = round2(sf);
    if (!(sf > 0) || type === "none") return;
    const ft = floorType(type);
    const sel = this.ctx.answers.floorItemIds?.[type] || undefined;
    const suffix = tag ? ` — ${tag}` : "";
    if (ft.tile) {
      this.material("tile", sf, basis, { selectedId: sel, codes: ft.codes, match: [], label: `Tile${suffix}`, idKey, allowance: true });
      this.material("thinset", sf, basis, { idKey: idKey + "T" });
      this.material("grout", sf, basis, { idKey: idKey + "G" });
      this.labour("lab.tile", sf, basis, { label: `Tile install${suffix}`, idKey: idKey + "L" });
    } else {
      this.material("flooring", sf, basis, { selectedId: sel, codes: ft.codes, match: [], label: `${ft.label} flooring${suffix}`, idKey, allowance: true });
      this.material("underlay", sf, basis, { idKey: idKey + "U" });
      this.labour("lab.flooring", sf, basis, { label: `Flooring install${suffix}`, idKey: idKey + "L" });
    }
  }

  // A labour line, estimated in hours. The quantity (SF/LF/EA) is converted to
  // hours with the task's productivity and costed at JMRC's hourly rate — so
  // labour always prices (never a "missing number") straight from $40/hr.
  labour(key: string, units: number, basis: string, opts: { label?: string; idKey?: string; perHour?: number } = {}) {
    units = round2(units);
    if (!(units > 0)) return;
    const t = this.ctx.settings.labour.find((x) => x.key === key);
    if (!t) throw new Error(`Unknown labour task: ${key}`);
    const per = opts.perHour ?? t.perHour;
    const hours = per > 0 ? Math.round((units / per) * 10) / 10 : units;
    const p = this.ctx.settings.pricing;
    const rate = t.crew === "laborer" ? p.laborerCostPerHour : p.labourCostPerHour;
    this.lines.push({
      id: this.id(opts.idKey || key),
      section: t.section,
      kind: "labour",
      description: `${opts.label || t.label} (labour)`,
      qty: hours,
      unit: "hr",
      unitCost: rate,
      source: "rate",
      marginKey: "labour",
      toolKey: key,
      basis: `${basis} ÷ ${fmt(per)} ${t.unit}/hr = ${fmt(hours)} hr${t.crew === "laborer" ? " (labourer)" : ""}`,
      flags: [],
    });
  }

  // A line priced by an owner rate (sub-trade, allowance).
  rate(key: string, qty: number, basis: string, opts: { label?: string; idKey?: string; allowance?: boolean } = {}) {
    qty = round2(qty);
    if (!(qty > 0)) return;
    const r = this.ctx.settings.rates.find((x) => x.key === key);
    if (!r) throw new Error(`Unknown rate: ${key}`);
    const mine = r.value == null ? this.ctx.quoteRates?.[key] : undefined;
    const value = r.value ?? (mine != null ? mine : null);
    this.lines.push({
      id: this.id(opts.idKey || key),
      section: r.section,
      kind: r.kind,
      description: opts.label || r.label,
      qty,
      unit: r.unit,
      unitCost: value,
      source: value == null ? "unpriced" : r.value == null ? "repRate" : "rate",
      toolKey: key,
      basis,
      flags: value == null ? ["rate not set"] : r.value == null ? ["rate entered on this quote"] : [],
      allowance: opts.allowance ?? r.kind === "allowance",
    });
  }

  // Cabinet orders priced from the supplier catalogs (dealer cost). SKUs the
  // catalog doesn't have come through as unpriced lines, so they're asked about.
  private cabDone = false;
  cabinetLines(): CabinetSet[] {
    const sets = (this.ctx.cabinetSets || []).filter((x) => x.lines.length);
    if (this.cabDone) return sets;
    this.cabDone = true;
    for (const set of sets) {
      const data = this.ctx.cabinetData?.[set.supplier];
      let assembly = 0;
      for (const ln of set.lines) {
        if (!(ln.qty > 0)) continue;
        const p = data ? priceCabinet(set, data, ln.sku) : null;
        assembly += p && set.assemble && set.supplier === "divine" ? p.assemblyEach * ln.qty : 0;
        this.lines.push({
          id: `cab:${set.id}:${ln.id}`,
          section: "Cabinetry",
          kind: "material",
          description: p ? `${set.name} — ${SUPPLIER_LABEL[set.supplier]} ${p.sku} ${p.desc}${p.dims ? ` (${p.dims})` : ""}` : `${set.name} — ${SUPPLIER_LABEL[set.supplier]} ${ln.sku}`,
          qty: ln.qty,
          unit: "EA",
          unitCost: p ? p.dealer : null,
          source: p ? "cabinet" : "unpriced",
          costCode: "1901 Kitchen Cabinets",
          marginKey: "cabinets",
          basis: p ? `list $${p.list.toFixed(2)} − ${Math.round(p.discount * 100)}% dealer discount · ${p.finish}` : data ? "SKU not in the supplier catalog" : `${SUPPLIER_LABEL[set.supplier]} catalog not loaded`,
          flags: p ? [] : [data ? "cabinet SKU not found" : "cabinet catalog not loaded"],
          allowance: true,
        });
      }
      if (assembly > 0) this.lines.push({ id: `cab:${set.id}:assembly`, section: "Cabinetry", kind: "sub", description: `${set.name} — Divine assembly`, qty: 1, unit: "LS", unitCost: Math.round(assembly * 100) / 100, source: "cabinet", marginKey: "cabinets", basis: "per-unit assembly by category", flags: [], allowance: true });
      if (set.shipping > 0) this.lines.push({ id: `cab:${set.id}:freight`, section: "Cabinetry", kind: "allowance", description: `${set.name} — ${SUPPLIER_LABEL[set.supplier]} freight`, qty: 1, unit: "LS", unitCost: set.shipping, source: "quote", marginKey: "cabinets", basis: "freight", flags: [], allowance: true });
    }
    return sets;
  }

  // A supplier quote typed on the quote (windows package, trusses, cabinets…).
  quoted(idKey: string, section: string, description: string, amount: number, kind: LineKind = "allowance") {
    if (!(amount > 0)) return;
    this.lines.push({
      id: this.id(idKey), section, kind, description, qty: 1, unit: "LS", unitCost: amount,
      source: "quote", basis: "supplier quote entered on this quote", flags: [], allowance: kind === "allowance",
    });
  }
}

// Paint tools are set up per US gallon; a 5-gallon pail or a quart covers
// proportionally more or less.
export function paintSize(it: CatalogItem): number {
  const d = `${it.name} ${it.description}`.toLowerCase();
  if (/5[ -]?gal|\b5g\b|18\.9 ?l|\b19 ?l\b/.test(d)) return 5;
  if (/0\.95 ?l|\b1 ?qt\b|\bqt\b/.test(d)) return 0.25;
  return 1;
}

// Made-to-order cabinet/vanity lines are $0.00 in the catalog by design: the
// price comes from the drawings / cabinet quote.
export const asPerDrawings = (it: CatalogItem) =>
  /as per drawings/i.test(it.description) || /^(19|1110)/.test(it.costCode);

export const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-CA");

/* ----------------------------- new builds ----------------------------- */

export function newBuildTakeoff(t: Takeoff, a: Answers, type: ProjectType) {
  const L = pos(a.length), W = pos(a.width);
  if (!L || !W) return;
  const n = Math.max(1, Math.round(pos(a.storeys) || 1));
  const h = pos(a.wallHeight) || 8;
  const pitch = pos(a.roofPitch);
  const eave = a.eaveOverhang ?? 1, rake = a.rakeOverhang ?? 1;
  const P = 2 * (L + W);
  const A = L * W;
  const floorArea = A * n;
  const shop = type === "shop";

  const wins = pos(a.windowCount), winW = pos(a.windowAvgW) || 3, winH = pos(a.windowAvgH) || 4;
  const extDoors = pos(a.extDoorCount);
  const ohd = shop ? pos(a.overheadDoorCount) : 0;
  const ohW = pos(a.overheadDoorW) || 10, ohH = pos(a.overheadDoorH) || 8;
  const openingArea = wins * winW * winH + extDoors * 3 * 6.75 + ohd * ohW * ohH;
  const openings = wins + extDoors + ohd;

  // Roof geometry
  const sf = slopeFactor(pitch);
  const roofArea = (L + 2 * rake) * (W / 2 + eave) * sf * 2;
  const gableArea = 2 * ((W * ((W / 2) * pitch) / 12) / 2);
  const squares = roofArea / 100;
  const eaveLF = 2 * (L + 2 * rake);
  const rakeLF = 4 * (W / 2 + eave) * sf;

  // --- General
  t.rate("allow.permit", floorArea, `${fmt(floorArea)} SF floor area`);
  t.rate("sub.excavation", A, `footprint ${fmt(L)}' × ${fmt(W)}'`);

  // --- Foundation
  if (a.foundation !== "existing") {
    const slabIn = pos(a.slabThicknessIn) || 4;
    const slabM3 = (A * (slabIn / 12)) * 0.0283168;
    const footingM3 = a.foundation === "slab" ? P * (16 / 12) * (10 / 12) * 0.0283168 : P * (24 / 12) * (8 / 12) * 0.0283168;
    const wallM3 = a.foundation === "frost-wall" ? P * 4 * (8 / 12) * 0.0283168 : a.foundation === "basement-icf" ? P * 8 * (6 / 12) * 0.0283168 : 0;
    const m3 = slabM3 + footingM3 + wallM3;
    t.rate("sub.concrete", m3, `slab ${fmt(A)} SF × ${slabIn}" = ${fmt(slabM3)} m³ + footings ${fmt(footingM3)} m³${wallM3 ? ` + walls ${fmt(wallM3)} m³` : ""} (estimate — confirm against the foundation drawing)`);
    t.labour("lab.foundation", A, `footprint ${fmt(A)} SF`);
    t.material("anchorBolt", ceil(P / 6) + 4 * 2, `perimeter ${fmt(P)} LF ÷ 6' + 2 per corner`);
    t.material("sillGasket", P, `perimeter ${fmt(P)} LF`);
    t.material("rebar10", (L / 1.5 + 1) * W + (W / 1.5 + 1) * L, `slab grid @ 18" o.c. both ways`);
    if (a.foundation === "basement-icf") t.material("icfStraight", P * 8, `ICF walls ${fmt(P)} LF × 8'`);
  }

  // --- Framing: exterior walls (per storey)
  const fieldStuds = ceil((P * 12) / 16) + 1;
  const studsPerFloor = fieldStuds + 4 * 3 + openings * 4 + wins * (ceil((winW * 12) / 16) + 1);
  const studKey = h <= 8 ? "stud2x6_8" : h <= 9 ? "stud2x6_9" : "stud2x6_long";
  t.material(studKey, studsPerFloor * n, `(${fmt(P)} LF @ 16" o.c. = ${fieldStuds} + 12 corner + ${openings}×4 king/jack + window cripples) × ${n} storey`);
  t.material("plate2x6", P * 3 * n, `${fmt(P)} LF × 3 plates × ${n}`);
  t.material("header2x10", (wins * (winW + 0.25) + extDoors * 3.25 + ohd * (ohW + 0.25)) * 2, `openings + 3", 2-ply`);
  const wallSheathSF = P * h * n + gableArea + P * 1 * Math.max(0, n - 1);
  t.material("wallSheathing", wallSheathSF, `${fmt(P)} LF × ${h}' × ${n} + gables ${fmt(gableArea)} SF${n > 1 ? " + rim" : ""} (no opening deduction)`);
  t.material("houseWrap", wallSheathSF, `wall sheathing area`);
  if (n > 1) {
    t.material("subfloor", A * (n - 1), `${n - 1} upper floor(s) × ${fmt(A)} SF`);
    t.rate("allow.floorSystem", A * (n - 1), `upper floor area`);
  }
  if (a.foundation === "basement-icf") t.material("subfloor", A, `main floor over basement`, { idKey: "subfloorMain" });

  // Interior partitions
  const Li = pos(a.interiorWallLF);
  if (Li) {
    t.material(h <= 8 ? "stud2x4_8" : "stud2x4_9", ceil((Li * 12) / 16) + ceil(Li / 12) * 2, `${fmt(Li)} LF @ 16" o.c. + 2 per 12' (ends/tees)`);
    t.material("plate2x4", Li * 3, `${fmt(Li)} LF × 3 plates`);
    t.labour("lab.partition", Li, `${fmt(Li)} LF partitions`);
  }
  t.material("framingNails", (studsPerFloor * n + ceil((Li * 12) / 16)) * 8 + (wallSheathSF / 32) * 40, `~8 per stud + ~40 per sheet`);
  t.labour("lab.framing", floorArea, `${fmt(floorArea)} SF floor area`);
  if (a.trussQuote > 0) t.quoted("trusses", "Framing", "Roof truss package (supplier quote)", a.trussQuote, "material");
  else t.rate("allow.trusses", A, `footprint ${fmt(A)} SF (no truss quote entered)`);

  // --- Roofing
  t.material("roofSheathing", roofArea, `roof area (${fmt(L)}' + 2×${rake}') × (${fmt(W / 2)}' + ${eave}') × ${sf.toFixed(4)} × 2`);
  t.material("roofUnderlay", roofArea, `roof area`);
  t.material("iceWater", eaveLF * 3, `eaves ${fmt(eaveLF)} LF × 3'`);
  t.material("shingles", roofArea, `roof area ${fmt(squares)} squares`);
  t.material("starter", eaveLF + rakeLF, `eaves + rakes`);
  t.material("ridgeCap", L + 2 * rake, `ridge length`);
  t.material("ridgeVent", L + 2 * rake - 2, `ridge less 1' each end`);
  t.material("dripEdge", eaveLF + rakeLF, `eaves ${fmt(eaveLF)} + rakes ${fmt(rakeLF)} LF`);
  t.material("roofNails", squares * 320, `${fmt(squares)} squares × 320 nails`);
  t.labour("lab.roofing", squares * 1.1, `${fmt(squares)} squares + 10%`);

  // --- Windows & doors
  const wd = pos(a.windowsDoorsQuote);
  if (wd) t.quoted("windowsDoors", "Windows & Doors", "Windows & exterior doors (supplier quote)", wd);
  else {
    t.rate("allow.windowsDoors", wins, `${wins} windows (no supplier quote entered)`);
    t.rate("allow.extDoor", extDoors, `${extDoors} exterior doors (no supplier quote entered)`);
  }
  t.labour("lab.windowInstall", wins + extDoors, `${wins + extDoors} openings`);
  if (ohd) {
    if (a.overheadDoorQuote > 0) t.quoted("overheadDoors", "Windows & Doors", `Overhead doors (${ohd}) — supplier quote`, a.overheadDoorQuote);
    else t.rate("allow.overheadDoor", ohd, `${ohd} × ${ohW}'×${ohH}' overhead doors`);
  }

  // --- Exterior finish
  const cladSF = P * h * n + gableArea - openingArea;
  t.material("sidingVinyl", cladSF, `walls + gables − openings`);
  t.material("starterSiding", P, `perimeter`);
  t.material("outsideCorner", 4 * h * n, `4 corners × ${h}' × ${n}`);
  t.material("jChannel", wins * 2 * (winW + winH) + extDoors * 2 * (3 + 6.75) + ohd * (2 * ohH + ohW) + rakeLF, `around openings + gable rakes`);
  t.material("soffit", (eaveLF + rakeLF) * Math.max(eave, rake, 0.5), `eaves + rakes × overhang`);
  t.material("fChannel", eaveLF + rakeLF, `soffit return`);
  t.material("fascia", eaveLF + rakeLF, `eaves + rakes`);
  t.labour("lab.siding", cladSF, `${fmt(cladSF)} SF cladding`);

  // --- Insulation & vapour barrier
  const insulated = !shop || a.insulated;
  const netWall = P * h * n - openingArea;
  if (insulated) {
    t.material("battR22", netWall, `ext. walls net of openings`);
    t.material("blownAttic", A, `ceiling ${fmt(A)} SF`);
    t.material("rafterVent", eaveLF, `eaves`);
    t.material("poly", P * h * n + A, `ext. walls gross + ceiling`);
    t.material("tuckTape", P * h * n + A, `poly area`);
    t.material("acousticSealant", P * h * n + A, `poly area`);
    t.labour("lab.insulation", netWall + A, `walls + ceiling`);
  }

  // --- Drywall / interior lining
  const lining = shop ? a.interiorFinish : "drywall";
  const intDoors = pos(a.interiorDoorCount);
  const wallBoard = P * h * n + 2 * Li * h - openingArea - intDoors * 2 * 2.67 * 6.67;
  const ceilingBoard = A * n;
  if (lining === "drywall") {
    const board = wallBoard + ceilingBoard;
    t.material(shop ? "drywallX" : "drywall12", board, `ext. walls one face + partitions both faces − openings + ceilings`);
    t.material("mud", board, `board area`);
    t.material("tape", board, `board area`);
    t.material("dwScrews", board, `board area`);
    t.material("cornerBead", 4 * h * n + wins * 2 * (winW + winH), `corners + window returns`);
    t.labour("lab.drywall", board, `${fmt(board)} SF board`);
  } else if (lining === "osb") {
    t.material("wallSheathing", wallBoard, `interior walls lined with OSB`, { label: "Interior OSB liner", section: "Interior Finish", idKey: "osbLiner" });
    t.labour("lab.drywall", wallBoard, `${fmt(wallBoard)} SF OSB liner hung`, { label: "Interior liner install" });
  }

  // --- Interior finish & paint (houses, and shops with drywall)
  if (!shop || lining === "drywall") {
    const kitchenLF = pos(a.kitchenCabinetLF);
    const baseLF = P * n + 2 * Li - intDoors * 2 * 2.67 - extDoors * 3 - kitchenLF;
    if (!shop) {
      t.material("baseboard", baseLF, `wall faces at floor − doors − cabinets`);
      const casingLF = intDoors * 2 * (2 * 7 + 3.5) + wins * (2 * (winW + winH) + 1);
      t.material("casing", casingLF, `doors both sides + window casing`);
      t.labour("lab.trim", baseLF + casingLF, `${fmt(baseLF + casingLF)} LF trim`);
      t.material("interiorDoor", intDoors, `${intDoors} doors`, { selectedId: a.interiorDoorItemId || undefined });
      t.material("passageHandle", intDoors, `${intDoors} doors`);
      t.labour("lab.door", intDoors, `${intDoors} doors`);
    }
    const paintWalls = wallBoard;
    const paintCeil = ceilingBoard;
    t.material("primer", paintWalls + paintCeil, `walls + ceilings, 1 coat`);
    t.material("wallPaint", paintWalls * 2, `walls ${fmt(paintWalls)} SF × 2 coats`, { selectedId: a.paintItemId || undefined });
    t.material("ceilingPaint", paintCeil, `ceilings, 1 finish coat`);
    t.labour("lab.paint", paintWalls + paintCeil, `walls + ceilings`);
  }

  // --- Flooring & tile
  if (!shop) {
    const tileSF = pos(a.tileFloorSF);
    const floorSF = Math.max(0, floorArea - tileSF - pos(a.kitchenCabinetLF) * 2);
    t.floor(a.flooringType, floorSF, `floor area − tile − cabinets`, "floor");
    if (tileSF) t.floor("tile", tileSF, `tile floors`, "tilefloor");
    const showerSF = pos(a.showerTileSF);
    if (showerSF) {
      t.material("tile", showerSF, `shower walls`, { selectedId: a.showerTileItemId || a.floorItemIds?.tile || undefined, label: "Shower wall tile", idKey: "showerTile", allowance: true });
      t.material("showerMembrane", showerSF, `shower walls`);
      t.material("thinset", showerSF, `shower walls`, { idKey: "showerThinset" });
      t.labour("lab.showerTile", showerSF, `${fmt(showerSF)} SF`);
    }

    // --- Kitchen & baths
    const kLF = pos(a.kitchenCabinetLF);
    const sets = t.cabinetLines(); // priced cabinet orders replace the allowance
    if (sets.length) { /* priced from the supplier catalogs */ }
    else if (a.cabinetQuote > 0) t.quoted("cabinets", "Kitchen", "Cabinetry (Cabinet Designer / supplier quote)", a.cabinetQuote);
    else t.rate("allow.cabinetsLF", kLF, `${fmt(kLF)} LF cabinet run (no cabinet quote entered)`);
    t.labour("lab.cabinets", kLF, `${fmt(kLF)} LF`);
    t.material("countertop", pos(a.countertopSF), `countertops`, { selectedId: a.countertopItemId || undefined, allowance: true });
    const baths = pos(a.bathroomCount);
    if (baths) {
      t.material("toilet", baths, `${baths} bathrooms`, { selectedId: a.toiletItemId || undefined, allowance: true });
      if (!sets.some((x) => /vanit/i.test(x.name))) t.material("vanity", baths, `${baths} bathrooms`, { selectedId: a.vanityItemId || undefined, allowance: true });
      t.material("faucet", baths, `${baths} bathrooms`, { selectedId: a.faucetItemId || undefined, allowance: true });
      t.material("tub", baths, `${baths} bathrooms`, { selectedId: a.tubItemId || undefined, allowance: true });
      t.labour("lab.fixtures", baths, `${baths} bathrooms`);
    }
    // Fixtures: toilet + sink per bath, tub/shower per bath, kitchen sink, laundry, hose bibs (2)
    t.rate("sub.plumbingFixture", baths * 3 + 1 + 1 + 2, `${baths} baths × 3 + kitchen + laundry + 2 hose bibs`);
  } else if (pos(a.bathroomCount)) {
    t.rate("sub.plumbingFixture", pos(a.bathroomCount) * 2 + 1, `washroom fixtures + utility sink`);
  }

  // --- Electrical, lighting, HVAC
  t.rate("sub.electricalSF", floorArea, `${fmt(floorArea)} SF`);
  const lights = pos(a.lightFixtureCount);
  if (lights) {
    t.material("lightFixture", lights, `${lights} fixtures`, { selectedId: a.lightFixtureItemId || undefined, allowance: true });
    t.labour("lab.fixtureInstall", lights, `${lights} fixtures`);
  }
  const heatKey = { baseboard: "sub.hvacBaseboard", "mini-split": "sub.hvacMiniSplit", "forced-air": "sub.hvacForcedAir", none: "" }[a.heating];
  if (heatKey && insulated) t.rate(heatKey, floorArea, `${fmt(floorArea)} SF heated`);

  t.labour("lab.cleanup", floorArea, `${fmt(floorArea)} SF`);
  t.rate("sub.bin", Math.max(pos(a.disposalBins), ceil(floorArea / 800)), `≈ 1 bin per 800 SF (or as entered)`, { label: "Waste disposal bins" });
}

/* ----------------------------- renovations ----------------------------- */

export function roomGeometry(r: Room) {
  const L = pos(r.length), W = pos(r.width), H = pos(r.height) || 8;
  const floor = L * W;
  const perim = 2 * (L + W);
  const openings = pos(r.doors) * 2.67 * 6.67 + pos(r.windows) * 12;
  const walls = Math.max(0, perim * H - openings);
  return { L, W, H, floor, perim, walls, ceiling: floor };
}

export function renovationTakeoff(t: Takeoff, a: Answers, type: ProjectType) {
  const rooms = a.rooms || [];
  const covered = new Set(t.cabinetLines().map((x) => x.roomId));
  let totalFloor = 0, demoFloor = 0;
  for (const r of rooms) {
    const g = roomGeometry(r);
    const tag = r.name || r.kind;
    totalFloor += g.floor;
    const key = (k: string) => `${k}@${r.id}`;

    // Demo
    const demo = (r.demoFloor ? g.floor : 0) + (r.demoWalls ? g.walls / 2 : 0);
    if (demo) { demoFloor += demo; t.labour("lab.demo", demo, `${tag}: ${r.demoFloor ? `floor ${fmt(g.floor)} SF` : ""}${r.demoWalls ? ` + walls (${fmt(g.walls)} SF ÷ 2)` : ""}`, { label: `Demolition — ${tag}`, idKey: key("demo") }); }

    // Remodel: walls
    if (pos(r.wallsRemovedLF)) {
      t.labour("lab.demo", r.wallsRemovedLF * g.H, `${tag}: ${fmt(r.wallsRemovedLF)} LF wall × ${g.H}'`, { label: `Wall removal — ${tag}`, idKey: key("wallDemo") });
      if (r.loadBearingRemoved) t.rate("allow.beam", 1, `${tag}: bearing wall removed`, { label: `Structural beam & engineering — ${tag}`, idKey: key("beam") });
    }
    const nw = pos(r.newWallsLF);
    if (nw) {
      t.material(g.H <= 8 ? "stud2x4_8" : "stud2x4_9", ceil((nw * 12) / 16) + 2, `${tag}: ${fmt(nw)} LF new wall @ 16"`, { idKey: key("studs") });
      t.material("plate2x4", nw * 3, `${tag}: ${fmt(nw)} LF × 3`, { idKey: key("plates") });
      t.labour("lab.partition", nw, `${tag}: new walls`, { label: `Wall framing — ${tag}`, idKey: key("frame") });
    }

    // Drywall
    const extraBoard = nw * g.H * 2;
    if (r.drywall === "patch") t.labour("lab.drywallPatch", g.walls * 0.15, `${tag}: 15% of ${fmt(g.walls)} SF walls`, { label: `Drywall repair — ${tag}`, idKey: key("patch") });
    else if (r.drywall !== "none" || extraBoard) {
      const board = (r.drywall === "walls" || r.drywall === "walls+ceiling" ? g.walls : 0) + (r.drywall === "walls+ceiling" ? g.ceiling : 0) + extraBoard;
      const wet = r.kind === "bathroom" || r.kind === "ensuite" || r.kind === "laundry";
      t.material("drywall12", board, `${tag}: ${r.drywall !== "none" ? r.drywall : ""}${extraBoard ? " + new walls both faces" : ""}${wet ? " (use moisture-resistant board in wet areas)" : ""}`, { idKey: key("dw") });
      t.material("mud", board, `${tag}`, { idKey: key("mud") });
      t.material("tape", board, `${tag}`, { idKey: key("tape") });
      t.material("dwScrews", board, `${tag}`, { idKey: key("screws") });
      t.labour("lab.drywall", board, `${tag}: ${fmt(board)} SF`, { label: `Drywall — ${tag}`, idKey: key("dwl") });
    }

    // Paint
    const pw = r.paintWalls ? g.walls + extraBoard : 0;
    const pc = r.paintCeiling ? g.ceiling : 0;
    if (pw || pc) {
      t.material("primer", r.drywall !== "none" ? pw + pc : 0, `${tag}: new board`, { idKey: key("primer") });
      if (pw) t.material("wallPaint", pw * 2, `${tag}: walls ${fmt(pw)} SF × 2 coats`, { selectedId: a.paintItemId || undefined, idKey: key("paint") });
      if (pc) t.material("ceilingPaint", pc, `${tag}: ceiling`, { idKey: key("cpaint") });
      t.labour("lab.paint", pw + pc, `${tag}`, { label: `Painting — ${tag}`, idKey: key("paintl") });
    }

    // Floors — the room's floor type sets the product (by cost code) and install
    const cabinetFloor = pos(r.cabinetLF) * 2;
    if (r.floor !== "none") {
      const sf = floorType(r.floor).tile
        ? Math.max(0, g.floor - cabinetFloor - (r.tubShower !== "none" ? 15 : 0) - (r.vanity ? 4 : 0))
        : Math.max(0, g.floor - cabinetFloor);
      t.floor(r.floor, sf, `${tag}: ${fmt(g.L)}' × ${fmt(g.W)}'${cabinetFloor ? " − cabinets" : ""}`, key("floor"), tag);
    }

    // Trim & doors
    if (r.baseboard) {
      const lf = Math.max(0, g.perim - pos(r.doors) * 2.67 - pos(r.cabinetLF) - (r.vanity ? 3 : 0) - (r.tubShower !== "none" ? 5 : 0));
      t.material("baseboard", lf, `${tag}: perimeter − doors − cabinets`, { idKey: key("base") });
      t.labour("lab.trim", lf, `${tag}`, { label: `Trim — ${tag}`, idKey: key("trim") });
    }
    if (pos(r.newInteriorDoors)) {
      const d = r.newInteriorDoors;
      t.material("interiorDoor", d, `${tag}`, { selectedId: a.interiorDoorItemId || undefined, idKey: key("door") });
      t.material("passageHandle", d, `${tag}`, { idKey: key("handle") });
      t.material("casing", d * 2 * (2 * 7 + 3.5), `${tag}: both sides`, { idKey: key("casing") });
      t.labour("lab.door", d, `${tag}`, { label: `Door install — ${tag}`, idKey: key("doorl") });
    }

    // Kitchen
    if (pos(r.cabinetLF)) {
      if (!(a.cabinetQuote > 0) && !covered.has(r.id) && !covered.has("")) t.rate("allow.cabinetsLF", r.cabinetLF, `${tag}: ${fmt(r.cabinetLF)} LF (no cabinet quote entered)`, { label: `Cabinetry — ${tag}`, idKey: key("cab") });
      t.labour("lab.cabinets", r.cabinetLF, `${tag}`, { label: `Cabinet install — ${tag}`, idKey: key("cabl") });
    }
    t.material("countertop", pos(r.countertopSF), `${tag}: countertops`, { selectedId: a.countertopItemId || undefined, idKey: key("ct"), allowance: true });
    if (pos(r.backsplashSF)) {
      t.material("backsplash", r.backsplashSF, `${tag}`, { selectedId: a.backsplashItemId || undefined, idKey: key("bs"), allowance: true });
      t.labour("lab.showerTile", r.backsplashSF, `${tag}: backsplash`, { label: `Backsplash install — ${tag}`, idKey: key("bsl") });
    }

    // Bath
    let fixtures = 0;
    if (r.toilet) { fixtures++; t.material("toilet", 1, tag, { selectedId: a.toiletItemId || undefined, idKey: key("toilet"), allowance: true }); }
    if (r.vanity) {
      fixtures++;
      if (!covered.has(r.id)) t.material("vanity", 1, tag, { selectedId: a.vanityItemId || undefined, idKey: key("vanity"), allowance: true });
      t.material("faucet", 1, tag, { selectedId: a.faucetItemId || undefined, idKey: key("faucet"), allowance: true });
    }
    if (r.tubShower !== "none") { fixtures++; t.material("tub", 1, `${tag}: ${r.tubShower}`, { selectedId: a.tubItemId || undefined, idKey: key("tub"), allowance: true }); }
    if (pos(r.showerWallTileSF)) {
      t.material("tile", r.showerWallTileSF, `${tag}: shower walls`, { selectedId: a.showerTileItemId || a.floorItemIds?.tile || undefined, label: "Shower wall tile", idKey: key("stile"), allowance: true });
      t.material("showerMembrane", r.showerWallTileSF, `${tag}`, { idKey: key("membrane") });
      t.material("thinset", r.showerWallTileSF, `${tag}: shower walls`, { idKey: key("sthinset") });
      t.labour("lab.showerTile", r.showerWallTileSF, `${tag}`, { label: `Shower tile — ${tag}`, idKey: key("stilel") });
    }
    if (pos(r.cabinetLF) && (r.kind === "kitchen")) fixtures++; // kitchen sink
    if (fixtures) {
      t.rate("sub.plumbingFixture", fixtures, `${tag}: ${fixtures} fixture(s)`, { label: `Plumbing — ${tag}`, idKey: key("plumb") });
      if (r.toilet || r.vanity) t.labour("lab.fixtures", 1, tag, { label: `Fixture setting — ${tag}`, idKey: key("fix") });
    }
    if (r.plumbingRelocated) t.rate("sub.plumbingRelocate", 1, tag, { label: `Plumbing relocation — ${tag}`, idKey: key("reloc") });

    // Electrical & lighting
    if (r.demoWalls || nw || pos(r.cabinetLF) || r.kind === "bathroom" || r.kind === "ensuite" || type === "remodel")
      t.rate("sub.electricalRoom", g.floor, `${tag}: ${fmt(g.floor)} SF`, { label: `Electrical — ${tag}`, idKey: key("elec") });
    if (pos(r.lightFixtures)) {
      t.material("lightFixture", r.lightFixtures, tag, { selectedId: a.lightFixtureItemId || undefined, idKey: key("light"), allowance: true });
      t.labour("lab.fixtureInstall", r.lightFixtures, tag, { label: `Fixture install — ${tag}`, idKey: key("lightl") });
    }
  }
  if (!rooms.length) return;
  if (a.occupied) t.rate("allow.occupied", 1, "occupied home");
  const bins = pos(a.disposalBins) || (demoFloor ? Math.max(1, ceil(demoFloor / 600)) : 0);
  t.rate("sub.bin", bins, a.disposalBins ? "as entered" : `≈ 1 bin per 600 SF demolished`, { label: "Waste disposal bins" });
  t.labour("lab.cleanup", totalFloor, `${fmt(totalFloor)} SF of rooms in scope`);
  if (type === "remodel" || rooms.some((r) => r.wallsRemovedLF || r.newWallsLF || r.plumbingRelocated))
    t.rate("allow.permitReno", 1, "structural / layout changes need a permit");
}

export function runTakeoff(ctx: Ctx): Line[] {
  const t = new Takeoff(ctx);
  if (ctx.type === "shop") t.cabinetLines();
  if (ctx.type === "shop" || ctx.type === "custom-home") newBuildTakeoff(t, ctx.answers, ctx.type);
  else renovationTakeoff(t, ctx.answers, ctx.type);
  return t.lines;
}
