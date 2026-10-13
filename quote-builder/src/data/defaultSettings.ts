import type { MarginKey, PricingRules, Rate, Settings, ToolComponent } from "../types";

// Pre-configured takeoff tools. Each component says how to find its material
// in the cost catalog (match terms, or an exact item the owner pins in
// Settings) and how much one catalog unit covers. Coverage figures come from
// the product description where it states one (e.g. "49 Sqft", "4' x 8'");
// anything the description doesn't state is marked unverified so the quote
// flags it until the owner confirms it in Settings → Takeoff tools.
//
// No dollar figures live here. Material costs come from the catalog; labour,
// sub-trade and allowance rates are blank until the owner sets them.

const c = (
  key: string, section: string, label: string, match: string[],
  coverage: number, coverageNote: string, coverageVerified: boolean, waste: number,
  extra: Partial<ToolComponent> = {},
): ToolComponent => ({ key, section, label, match, coverage, coverageNote, coverageVerified, waste, ...extra });

export const DEFAULT_COMPONENTS: ToolComponent[] = [
  // Foundation & concrete
  c("anchorBolt", "Foundation", "Anchor bolts @ 6' o.c.", ["anchor bolt", "1/2"], 1, "1 per bolt", true, 0),
  c("sillGasket", "Foundation", "Sill gasket", ["sill gasket"], 82, "82' roll (from description)", true, 0.05),
  c("rebar10", "Foundation", "Rebar 10M (slab grid / footing)", ["rebar", "10mm", "20'"], 20, "20' bar", true, 0.1),
  c("icfStraight", "Foundation", "ICF R22 6\" straight block", ["icf", "6\"", "straight", "5.33"], 5.33, "5.33 SF of wall per block (from description)", true, 0.05),

  // Framing
  c("stud2x6_8", "Framing", "2x6 stud 92-5/8\" / 8' (ext. walls ≤ 8')", ["2 x 6", "stud", "8'"], 1, "1 stud", true, 0.1, { codes: ["0602"] }),
  c("stud2x6_9", "Framing", "2x6 stud 104-5/8\" (ext. walls 9')", ["2 x 6", "104-5/8"], 1, "1 stud", true, 0.1, { codes: ["0602"] }),
  c("stud2x6_long", "Framing", "2x6 x 12' (ext. walls 10'+)", ["2 x 6 x 12'"], 1, "1 board", true, 0.1, { codes: ["0601"] }),
  c("stud2x4_8", "Framing", "2x4 stud 92-5/8\" (partitions ≤ 8')", ["2 x 4", "92-5/8"], 1, "1 stud", true, 0.1, { codes: ["0602"] }),
  c("stud2x4_9", "Framing", "2x4 stud 104-5/8\" (partitions 9'+)", ["2 x 4", "104-5/8"], 1, "1 stud", true, 0.1, { codes: ["0602"] }),
  c("plate2x6", "Framing", "2x6 plates (14' stock)", ["2 x 6 x 14'"], 14, "14 LF per board", true, 0.1, { codes: ["0601"] }),
  c("plate2x4", "Framing", "2x4 plates (14' stock)", ["2 x 4 x 14'", "#2 & better"], 14, "14 LF per board", true, 0.1, { codes: ["0601"] }),
  c("header2x10", "Framing", "2x10 header stock (10')", ["2 x 10 x 10'"], 10, "10 LF per board", true, 0.1, { codes: ["0601"] }),
  c("wallSheathing", "Framing", "7/16\" OSB wall sheathing", ["7/16", "4' x 8'", "osb"], 32, "4'x8' = 32 SF", true, 0.1, { codes: ["0603"] }),
  c("subfloor", "Framing", "23/32\" T&G OSB subfloor", ["23/32", "tongue"], 32, "4'x8' = 32 SF", true, 0.08, { codes: ["0603"] }),
  c("houseWrap", "Framing", "House wrap", ["tyvek homewrap", "9'"], 900, "100' x 9' = 900 SF", true, 0.1),
  c("framingNails", "Framing", "Framing nails 3-1/4\" (box)", ["3-1/4", "prostrip framing nail", "3000"], 3000, "3000 nails/box; ~8 nails per stud-equivalent", false, 0),

  // Roofing
  c("roofSheathing", "Roofing", "Roof sheathing 19/32\" T&G OSB", ["19/32", "osb"], 32, "4'x8' = 32 SF", true, 0.1, { codes: ["0603"] }),
  c("shingles", "Roofing", "Architectural shingles (bundle)", ["architectural shingle", "33.3"], 33.3, "33.3 SF per bundle (from description)", true, 0.1, { codes: ["0901"] }),
  c("starter", "Roofing", "Starter strip (bundle)", ["starter strip", "leading edge"], 100, "LF per bundle — confirm with supplier", false, 0.05, { codes: ["0901"] }),
  c("ridgeCap", "Roofing", "Hip & ridge cap (bundle)", ["hip & ridge"], 20, "LF per bundle — confirm with supplier", false, 0.05, { codes: ["0901"] }),
  c("iceWater", "Roofing", "Ice & water shield (eaves + valleys)", ["ice & water", "36\" x 65'"], 195, "36\" x 65' = 195 SF", true, 0.1),
  c("roofUnderlay", "Roofing", "Synthetic roof underlay", ["novaseal", "48\" x 250'"], 1000, "48\" x 250' = 1000 SF", true, 0.1),
  c("dripEdge", "Roofing", "Drip edge 10'", ["drip edge", "10'"], 10, "10' length", true, 0.1, { codes: ["0901"] }),
  c("ridgeVent", "Roofing", "Ridge vent roll 20'", ["ridge vent", "20'"], 20, "20' roll", true, 0.05),
  c("roofNails", "Roofing", "Roofing coil nails (7200/box)", ["roofing coil nail", "7200"], 7200, "7200 nails; ~320 nails per square", false, 0, { unit: "BX" }),

  // Exterior finish
  c("sidingVinyl", "Exterior", "Vinyl siding (double 4\" 12' piece)", ["sentry double 4\" horizontal"], 8, "SF per piece — confirm (8\" exposure × 12')", false, 0.1),
  c("starterSiding", "Exterior", "Siding starter strip 12'", ["12' starter strip"], 12, "12' length", true, 0.1),
  c("jChannel", "Exterior", "J-channel 12'", ["j-channel", "12'"], 12, "12' length", true, 0.15),
  c("outsideCorner", "Exterior", "Outside corner 10'", ["outside corner", "10'"], 10, "10' length", true, 0),
  c("soffit", "Exterior", "Perforated soffit (double 5\")", ["double 5\" perforated soffit", "standard"], 10, "SF per 12' panel — confirm", false, 0.1),
  c("fascia", "Exterior", "Aluminum fascia flat stock (24\" x 98')", ["aluminum", "flat stock"], 392, "LF of 6\" fascia per 98' coil (4 strips) — confirm", false, 0.1),
  c("fChannel", "Exterior", "F-channel 12'", ["f-channel", "12'"], 12, "12' length", true, 0.1),

  // Insulation & air barrier
  c("battR22", "Insulation", "R22 batts (2x6 walls)", ["r22", "49 sqft"], 49, "49 SF per bag (from description)", true, 0.05, { codes: ["1301"] }),
  c("battR14", "Insulation", "QuietZone / R14 batts (2x4 walls)", ["quietzone", "110 sqft"], 110, "110 SF per bag (from description)", true, 0.05, { codes: ["1301"] }),
  c("blownAttic", "Insulation", "Blown-in attic insulation (R60)", ["atticat", "blown"], 40, "SF per bag at R60 — use the bag chart", false, 0.05, { codes: ["1301"] }),
  c("poly", "Insulation", "6 mil vapour barrier (10' x 150')", ["6 mil", "1500 sqft"], 1500, "1500 SF per roll (from description)", true, 0.15),
  c("tuckTape", "Insulation", "Sheathing tape", ["tuck tape", "red"], 500, "SF of poly per roll — rule of thumb", false, 0),
  c("acousticSealant", "Insulation", "Acoustical sealant", ["acoustical sealant", "300"], 150, "SF of poly per tube — rule of thumb", false, 0),
  c("rafterVent", "Insulation", "Rafter vents", ["raft-r-mate"], 2, "1 per truss bay (24\" o.c.) — LF of eave per vent", true, 0.05),

  // Drywall
  c("drywall12", "Drywall", "1/2\" drywall 4'x12'", ["drywall 1/2\"", "4' x 12'", "tapered"], 48, "4'x12' = 48 SF", true, 0.1, { codes: ["1401"] }),
  c("drywallX", "Drywall", "5/8\" Type X 4'x12' (garage / shop)", ["type x", "4' x 12'"], 48, "4'x12' = 48 SF", true, 0.1),
  c("mud", "Drywall", "All-purpose compound 17 L", ["all purpose", "compound"], 400, "SF of board per pail — rule of thumb", false, 0),
  c("tape", "Drywall", "Paper tape 500'", ["joint reinforcement", "tape 500"], 1250, "SF of board per roll — rule of thumb", false, 0),
  c("dwScrews", "Drywall", "Drywall screws 1-5/8\" (5000)", ["drywall screw", "5000"], 4800, "SF of board per box (~1 screw/SF)", false, 0),
  c("cornerBead", "Drywall", "Metal corner bead 8'", ["corner bead"], 8, "8' length", true, 0.1),

  // Interior finish
  c("baseboard", "Interior Finish", "MDF primed baseboard 16'", ["baseboard", "16'", "5-1/2"], 16, "16' length", true, 0.1, { codes: ["2101"] }),
  c("casing", "Interior Finish", "Door/window casing (architrave)", ["craftsman style primed mdf architrave"], 7, "LF per piece — confirm length", false, 0.1),
  c("interiorDoor", "Interior Finish", "Prehung interior door (default)", ["32\" x 80\"", "2-panel", "prehung", "lh"], 1, "1 door", true, 0, { codes: ["1501"] }),
  c("passageHandle", "Interior Finish", "Interior door handle", ["weiser casey", "privacy lever"], 1, "1 per door", true, 0),
  c("primer", "Paint", "PVA primer (1 gal)", ["pva interior latex primer"], 350, "SF per gallon, 1 coat", false, 0.05),
  c("wallPaint", "Paint", "Wall paint (default, 1 gal)", ["duration home interior matte"], 350, "SF per gallon per coat", false, 0.05),
  c("ceilingPaint", "Paint", "Ceiling paint (1 gal)", ["premium ceiling paint", "3.8 l"], 350, "SF per gallon per coat", false, 0.05),

  // Flooring & tile defaults (the Selections step overrides the product)
  c("flooring", "Flooring", "Flooring (default product)", ["spc"], 1, "1 SF", true, 0.1, { codes: ["1701"], unit: "SF" }),
  c("underlay", "Flooring", "Underlay (if the product needs one)", ["underlayment", "200"], 200, "200 SF per roll", true, 0.05),
  c("tile", "Tile", "Floor tile (default product)", ["porcelain tile"], 1, "1 SF", true, 0.12, { codes: ["1801"], unit: "SF" }),
  c("thinset", "Tile", "Large-tile mortar 50 lb", ["4-xlt", "50"], 45, "SF per bag (12x24) — rule of thumb", false, 0),
  c("grout", "Tile", "Grout", ["grout"], 100, "SF per unit — confirm product", false, 0, { codes: ["1803"] }),
  c("showerMembrane", "Tile", "Shower waterproofing membrane", ["kerdi waterproofing membrane", "108"], 108, "108 SF per roll (from description)", true, 0.1, { codes: ["1803"] }),

  // Kitchen & bath fixtures (Selections step overrides)
  c("countertop", "Kitchen", "Quartz countertop (default tier)", ["quartz"], 1, "1 SF", true, 0.05, { codes: ["2001"], unit: "SF" }),
  c("backsplash", "Kitchen", "Backsplash tile", ["backsplash"], 1, "1 SF", true, 0.12, { codes: ["1802"] }),
  c("toilet", "Bathroom", "Toilet", ["toilet"], 1, "1 each", true, 0, { codes: ["1109"] }),
  c("vanity", "Bathroom", "Vanity", ["vanity cabinets"], 1, "1 each", true, 0, { codes: ["1110"] }),
  c("faucet", "Bathroom", "Bathroom faucet", ["faucet"], 1, "1 each", true, 0, { codes: ["1105"] }),
  c("tub", "Bathroom", "Tub / shower base", ["bathtub", "alcove"], 1, "1 each", true, 0, { codes: ["1107"] }),
  c("lightFixture", "Electrical", "Light fixture (default)", ["flush mount"], 1, "1 each", true, 0, { codes: ["1003"] }),
];

const r = (key: string, section: string, label: string, unit: string, kind: Rate["kind"], note = ""): Rate =>
  ({ key, section, label, unit, kind, value: null, note });

// Owner rates — blank until set. A blank rate shows on the quote as an
// unpriced line, so a quote can't go out with a missing number.
export const DEFAULT_RATES: Rate[] = [
  r("lab.demo", "Demolition", "Demolition & haul-off labour", "SF", "labour", "per SF of floor area demolished"),
  r("sub.bin", "Demolition", "Disposal bin (each)", "EA", "allowance", "delivered, picked up and dumped"),
  r("allow.permit", "General", "Building permit allowance", "SF", "allowance", "per SF of floor area (new builds)"),
  r("allow.permitReno", "General", "Building permit allowance (renovation)", "EA", "allowance", "flat per renovation that needs one"),
  r("sub.excavation", "Foundation", "Excavation & site prep", "SF", "sub", "per SF of footprint"),
  r("sub.concrete", "Foundation", "Concrete supplied & placed", "m³", "sub", "per m³ — never a lump sum"),
  r("lab.foundation", "Foundation", "Foundation / slab forming labour", "SF", "labour", "per SF of footprint"),
  r("lab.framing", "Framing", "Framing labour (shell)", "SF", "labour", "per SF of floor area"),
  r("lab.partition", "Framing", "Interior wall framing labour", "LF", "labour", "per LF of new wall"),
  r("allow.trusses", "Framing", "Roof trusses (if no supplier quote)", "SF", "allowance", "per SF of footprint"),
  r("allow.floorSystem", "Framing", "Engineered floor system", "SF", "allowance", "per SF of upper floor area"),
  r("allow.beam", "Framing", "Structural beam / LVL for removed bearing wall", "EA", "allowance", "per bearing wall removed, incl. engineering"),
  r("lab.roofing", "Roofing", "Roofing labour", "SQ", "labour", "per square (100 SF) installed"),
  r("allow.windowsDoors", "Windows & Doors", "Windows (if no supplier quote)", "EA", "allowance", "per window"),
  r("allow.extDoor", "Windows & Doors", "Exterior door (if no supplier quote)", "EA", "allowance", "per door"),
  r("allow.overheadDoor", "Windows & Doors", "Overhead door supplied & installed", "EA", "allowance", "per door (if no quote)"),
  r("lab.windowInstall", "Windows & Doors", "Window / ext. door install labour", "EA", "labour", "per opening"),
  r("lab.siding", "Exterior", "Siding, soffit & fascia labour", "SF", "labour", "per SF of wall cladding"),
  r("lab.insulation", "Insulation", "Insulation & vapour barrier labour", "SF", "labour", "per SF insulated"),
  r("lab.drywall", "Drywall", "Drywall hang, tape & finish", "SF", "labour", "per SF of board"),
  r("lab.drywallPatch", "Drywall", "Drywall patch & repair", "SF", "labour", "per SF of room wall area patched"),
  r("lab.paint", "Paint", "Painting labour (prime + 2 coats)", "SF", "labour", "per SF of painted surface"),
  r("lab.trim", "Interior Finish", "Trim install (base & casing)", "LF", "labour", "per LF"),
  r("lab.door", "Interior Finish", "Interior door install", "EA", "labour", "per door incl. hardware"),
  r("lab.flooring", "Flooring", "Flooring install", "SF", "labour", "per SF"),
  r("lab.tile", "Tile", "Tile install (floor)", "SF", "labour", "per SF"),
  r("lab.showerTile", "Tile", "Shower / wall tile install incl. waterproofing", "SF", "labour", "per SF"),
  r("lab.cabinets", "Kitchen", "Cabinet install", "LF", "labour", "per LF of cabinet run"),
  r("allow.cabinetsLF", "Kitchen", "Cabinetry allowance (if no Cabinet Designer quote)", "LF", "allowance", "per LF of cabinet run — custom homes"),
  r("lab.countertop", "Kitchen", "Countertop template & install", "SF", "labour", "per SF (if not in stone price)"),
  r("sub.plumbingFixture", "Plumbing", "Plumbing — per fixture (rough-in + finish)", "EA", "sub", "toilet, sink, tub/shower, laundry, etc."),
  r("sub.plumbingRelocate", "Plumbing", "Plumbing relocation (remodel)", "EA", "sub", "per room with relocated plumbing"),
  r("sub.electricalSF", "Electrical", "Electrical — new build", "SF", "sub", "per SF of heated floor area incl. 200A panel"),
  r("sub.electricalRoom", "Electrical", "Electrical — renovated room", "SF", "sub", "per SF of renovated room"),
  r("lab.fixtureInstall", "Electrical", "Light fixture install", "EA", "sub", "per fixture"),
  r("sub.hvacBaseboard", "HVAC", "Electric baseboard heat", "SF", "sub", "per SF heated"),
  r("sub.hvacMiniSplit", "HVAC", "Mini-split heat pump system", "SF", "sub", "per SF heated incl. HRV"),
  r("sub.hvacForcedAir", "HVAC", "Forced-air system", "SF", "sub", "per SF heated incl. HRV"),
  r("lab.fixtures", "Bathroom", "Bathroom fixture setting (vanity, toilet, accessories)", "EA", "labour", "per bathroom"),
  r("lab.cleanup", "General", "Final clean & site cleanup", "SF", "labour", "per SF of floor area"),
  r("allow.occupied", "General", "Occupied-home protection & dust control", "EA", "allowance", "flat per occupied renovation"),
];

export function defaultSettings(): Settings {
  return {
    version: 1,
    components: DEFAULT_COMPONENTS.map((x) => ({ ...x })),
    rates: DEFAULT_RATES.map((x) => ({ ...x })),
    pricing: {
      margins: { material: null, finish: null, cabinets: null, labour: null, sub: null, allowance: null },
      codeMargins: {},
      codeMarginSource: "",
      useStoreRetail: false,
      pmFeeNewBuild: 0.15,
      contingency: 0,
      hst: 0.15,
      minMargin: null,
      autoApproveLimit: null,
    },
    company: {
      name: "J.M Robins Construction Ltd.",
      address: "164 Park Street, Sussex, NB  E4E 1V3",
      phone: "506-808-2711",
      signer: "Mike Robins",
      signerTitle: "General Contractor",
    },
    terms: { paymentScheduleNewBuild: "" },
    nextNumbers: {},
    updatedAt: "",
    updatedBy: "",
  };
}

// Bring a saved settings document up to date with tools/rates added in later
// versions, keeping every owner edit.
export function mergeSettings(saved: Partial<Settings> | null | undefined): Settings {
  const base = defaultSettings();
  if (!saved) return base;
  const byKey = <T extends { key: string }>(defs: T[], have: T[] | undefined) => {
    const m = new Map((have || []).map((x) => [x.key, x]));
    return defs.map((d) => ({ ...d, ...(m.get(d.key) || {}) }));
  };
  return {
    ...base,
    ...saved,
    components: byKey(base.components, saved.components),
    rates: byKey(base.rates, saved.rates),
    pricing: mergePricing(base.pricing, saved.pricing as Partial<PricingRules> & Record<string, unknown>),
    company: { ...base.company, ...(saved.company || {}) },
    terms: { ...base.terms, ...(saved.terms || {}) },
    nextNumbers: { ...(saved.nextNumbers || {}) },
  };
}

// Settings saved before margins replaced markups: markup m → margin m ÷ (1 + m).
function mergePricing(base: PricingRules, saved: Partial<PricingRules> & Record<string, unknown> | undefined): PricingRules {
  const out: PricingRules = { ...base, ...(saved || {}), margins: { ...base.margins, ...(saved?.margins || {}) }, codeMargins: { ...(saved?.codeMargins || {}) } };
  const legacy = (k: string): number | null => (typeof saved?.[k] === "number" ? (saved[k] as number) / (1 + (saved[k] as number)) : null);
  const fill = (key: MarginKey, from: string) => { if (out.margins[key] == null && legacy(from) != null) out.margins[key] = Math.round(legacy(from)! * 10000) / 10000; };
  fill("material", "materialMarkup"); fill("finish", "materialMarkup"); fill("cabinets", "materialMarkup");
  fill("labour", "labourMarkup"); fill("sub", "subMarkup"); fill("allowance", "subMarkup");
  for (const k of ["materialMarkup", "labourMarkup", "subMarkup", "hideCostsFromSales"]) delete (out as unknown as Record<string, unknown>)[k];
  return out;
}
