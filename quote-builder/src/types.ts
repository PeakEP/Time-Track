// Quote Builder data model.
//
// A Quote is a set of answers (the guided questionnaire) plus any manual
// lines. The takeoff engine turns the answers into quantity lines using the
// owner-configured takeoff tools (Settings), prices them from the cost
// catalog / Square catalog / owner rates, and the review rules decide whether
// the quote can go out without the owner looking at it.
//
// Prices are never invented: a line with no catalog match or no owner rate is
// carried as "unpriced" and blocks the quote from going out unreviewed.

export type ProjectType = "renovation" | "remodel" | "shop" | "custom-home";
export type ClientType = "direct" | "insurance";

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  renovation: "Renovation",
  remodel: "Remodel",
  shop: "New Shop / Garage",
  "custom-home": "Custom Home",
};

/* ----------------------------- catalog ----------------------------- */

export type CatalogSource = "jmrc" | "square" | "custom";

export interface CatalogItem {
  id: string; // stable: "jmrc:<hash>" or "sq:<variation id>"
  source: CatalogSource;
  name: string;
  description: string;
  unit: string; // EA SF LF FT SH RL BX BD BG PK ST …
  unitCost: number | null; // material cost, pre-markup, pre-HST. null/0 = not priced
  costCode: string; // e.g. "0602 Studs" (JMRC) or Square category
  sku?: string;
  retail?: number | null; // Square retail price (never used as cost)
}

/* ----------------------------- cabinets ----------------------------- */

export type CabinetSupplier = "aline" | "oppein" | "divine";

// One cabinet order on a quote (e.g. "Kitchen", "Ensuite vanity"), priced
// from the supplier's list price less JMRC's dealer discount.
export interface CabinetSet {
  id: string;
  name: string;
  roomId: string; // renovation room it covers ("" = whole job)
  supplier: CabinetSupplier;
  box: "PB" | "PLY";
  color: string; // Oppein colour code (sets the tier) / Aline colour code / Divine finishing colour
  style: string; // Aline door style / Divine style code (A5, H3, H8, S6, S7, E9)
  assemble: boolean; // Divine assembly
  shipping: number; // freight $ (Divine default 150)
  lines: { id: string; sku: string; qty: number }[];
  allowance?: number; // lump-sum package allowance (used when there's no priced SKU list)
  unit?: string; // unit shown for the allowance line (default PKG)
  notes: string;
}

/* ----------------------------- rooms ----------------------------- */

export type RoomKind =
  | "kitchen" | "bathroom" | "ensuite" | "bedroom" | "living" | "dining"
  | "basement" | "laundry" | "hallway" | "office" | "mudroom" | "other";

// Floor finish by type (maps to a catalog cost code — see FLOOR_TYPES). "none"
// means the floor isn't being changed in that room.
export type FloorType = "none" | "spc" | "laminate" | "hardwood" | "lvt" | "tile" | "other";

// A product pick set to this is "not included in this quote" — its line is
// dropped, rather than falling back to the default product.
export const EXCLUDED = "__none__";

export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  length: number; // ft
  width: number; // ft
  height: number; // ft
  doors: number; // openings in the room (for wall-area deductions + casing)
  windows: number;
  // Scope switches for the room
  demoFloor: boolean;
  demoWalls: boolean; // gut to studs
  floor: FloorType;
  paintWalls: boolean;
  paintCeiling: boolean;
  drywall: "none" | "patch" | "walls" | "walls+ceiling";
  baseboard: boolean;
  newInteriorDoors: number;
  lightFixtures: number;
  // Kitchen
  cabinetLF: number;
  countertopSF: number;
  backsplashSF: number;
  // Bathroom
  toilet: boolean;
  vanity: boolean;
  tubShower: "none" | "tub" | "shower";
  showerWallTileSF: number;
  // Remodel
  wallsRemovedLF: number;
  loadBearingRemoved: boolean;
  newWallsLF: number;
  plumbingRelocated: boolean;
  notes: string;
}

/* ----------------------------- answers ----------------------------- */

export interface Answers {
  // Client & project
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  siteAddress: string;
  clientType: ClientType;
  claimNo: string;
  tpaFile: string;
  insurer: string;
  tpa: string;
  estimator: string;
  scopeSummary: string;

  // New build geometry (shop / custom home)
  length: number;
  width: number;
  storeys: number;
  wallHeight: number; // 8 | 9 | 10 | 12 | 14 | 16
  roofPitch: number; // rise per 12
  eaveOverhang: number; // ft
  rakeOverhang: number; // ft
  foundation: "slab" | "frost-wall" | "basement-icf" | "existing";
  slabThicknessIn: number;
  windowCount: number;
  windowAvgW: number; // ft
  windowAvgH: number; // ft
  extDoorCount: number;
  overheadDoorCount: number;
  overheadDoorW: number;
  overheadDoorH: number;
  interiorWallLF: number;
  interiorDoorCount: number;
  bathroomCount: number;
  kitchenCabinetLF: number;
  countertopSF: number;
  tileFloorSF: number; // baths/laundry/entry
  showerTileSF: number; // all showers combined
  finishLevel: "standard" | "upgraded" | "premium";
  insulated: boolean; // shops
  interiorFinish: "none" | "osb" | "drywall"; // shops
  siding: "vinyl" | "engineered" | "steel";
  heating: "none" | "baseboard" | "mini-split" | "forced-air";
  lightFixtureCount: number;

  // Renovation / remodel
  rooms: Room[];
  occupied: boolean;
  disposalBins: number;

  // Selections (catalog item ids) — chosen in the Selections step. Empty = the
  // default product for that category; EXCLUDED = not included in this quote.
  flooringType: FloorType; // new builds: the main floor finish (rooms carry their own)
  floorItemIds: Record<string, string>; // chosen flooring product per floor type
  showerTileItemId: string;
  backsplashItemId: string;
  countertopItemId: string;
  paintItemId: string;
  interiorDoorItemId: string;
  lightFixtureItemId: string;
  toiletItemId: string;
  vanityItemId: string;
  faucetItemId: string;
  tubItemId: string;
  kitchenSinkItemId: string;
  kitchenFaucetItemId: string;
  cabinetHardwareItemId: string;
  underCabinetLightItemId: string;

  // Allowances the rep can enter from a supplier quote (0 = not entered)
  windowsDoorsQuote: number; // supplier quote $ (windows + ext doors)
  trussQuote: number;
  cabinetQuote: number; // e.g. from the Cabinet Designer
  overheadDoorQuote: number;

  inclusionsExtra: string;
  exclusionsExtra: string;
  notes: string;
}

/* ----------------------------- lines ----------------------------- */

export type LineKind = "material" | "labour" | "sub" | "allowance";

export type CostSource =
  | "catalog" // JMRC cost catalog
  | "square" // Robins Interiors Square catalog
  | "rate" // owner-configured rate
  | "quote" // supplier quote entered on the quote
  | "manual" // typed by the rep on a line
  | "repRate" // rate the rep entered on this quote (company rate not set)
  | "cabinet" // supplier cabinet catalog (list − dealer discount)
  | "unpriced";

export interface Line {
  id: string;
  section: string; // proposal grouping, e.g. "Framing"
  kind: LineKind;
  description: string;
  qty: number;
  unit: string;
  unitCost: number | null; // cost to JMRC per unit (null = unpriced)
  source: CostSource;
  catalogItemId?: string;
  costCode?: string; // catalog cost code (drives the margin category)
  marginKey?: MarginKey; // margin category
  toolKey?: string; // which takeoff tool / rate produced it
  basis?: string; // how the quantity was derived (shown in the takeoff)
  flags: string[]; // e.g. "auto-matched", "verify coverage"
  allowance?: boolean; // shows as an allowance in custom-home proposals
}

export interface ManualLine {
  id: string;
  section: string;
  kind: LineKind;
  description: string;
  qty: number;
  unit: string;
  unitCost: number | null;
  catalogItemId?: string;
}

/* ----------------------------- attachments ----------------------------- */

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  from: "upload" | "folder";
  addedAt: string;
}

export interface AiSuggestion {
  field: string; // answers key, or "room:<n>.<key>" / "rooms"
  value: unknown;
  confidence: "high" | "medium" | "low";
  source: string; // where it came from in the documents
  status: "pending" | "accepted" | "rejected";
}

/* ----------------------------- quote ----------------------------- */

export type QuoteStatus = "draft" | "needs-approval" | "approved" | "sent" | "won" | "lost";

export interface Quote {
  id: string;
  number: string; // REN2026-07 / CUS2026-03
  version: number;
  type: ProjectType;
  title: string;
  status: QuoteStatus;
  answers: Answers;
  manualLines: ManualLine[];
  // Per-line overrides on generated lines (keyed by line id)
  overrides: Record<string, { qty?: number; unitCost?: number | null; catalogItemId?: string; removed?: boolean; margin?: number }>;
  cabinetSets: CabinetSet[];
  // Rates the rep entered on this quote where the company rate isn't set
  rates: Record<string, number>;
  // Margins for this quote (start from Settings; the rep can adjust)
  margins: Partial<Record<MarginKey, number>>;
  attachments: Attachment[];
  ai: { suggestions: AiSuggestion[]; summary: string; ranAt: string };
  folderName: string;
  approval?: { by: string; at: string; note: string; totalAtApproval: number };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/* ----------------------------- settings ----------------------------- */

// A takeoff tool component: how one material in an assembly is found in the
// catalog and how much of the catalog unit one takeoff unit consumes.
export interface ToolComponent {
  key: string;
  section: string;
  label: string;
  match: string[]; // every term must appear in name/description (case-insensitive)
  unit?: string; // preferred catalog unit
  codes?: string[]; // limit to these cost-code prefixes
  pinnedItemId?: string; // owner's exact choice — wins over `match`
  coverage: number; // takeoff units covered by ONE catalog unit (e.g. 32 SF per sheet)
  coverageNote: string;
  coverageVerified: boolean; // false → flagged "verify coverage"
  waste: number; // fraction, 0.10 = 10%
}

// A labour task: how fast the crew does it (units per hour), so hours =
// quantity ÷ perHour, costed at the hourly rate above. Seeded from JMRC's
// estimate worksheets; the owner tunes any of them.
export interface LabourTask {
  key: string;
  section: string;
  label: string;
  unit: string; // the takeoff unit the quantity is in (SF, LF, EA, SQ)
  perHour: number; // units completed per hour (e.g. 23 SF/hr flooring)
  crew: "carpenter" | "laborer";
  note: string;
}

// Owner rate (sub-trade or allowance) per takeoff unit. null = not set, so the
// salesperson is asked for it on each quote (they have the sub's quote).
export interface Rate {
  key: string;
  section: string;
  label: string;
  unit: string;
  kind: LineKind;
  value: number | null;
  note: string;
}

// Margins are gross margin on sell: sell = cost ÷ (1 − margin).
export type MarginKey = "material" | "finish" | "cabinets" | "labour" | "sub" | "allowance";
export const MARGIN_LABEL: Record<MarginKey, string> = {
  material: "Building materials",
  finish: "Finish products (flooring, tile, fixtures, lighting)",
  cabinets: "Cabinets & countertops",
  labour: "Labour",
  sub: "Sub-trades",
  allowance: "Allowances & supplier quotes",
};

export interface PricingRules {
  // Labour is estimated in hours; cost per hour → sell via the labour margin.
  labourCostPerHour: number; // carpenter / tradesperson, e.g. 40 → 80 sell at 50%
  laborerCostPerHour: number; // general labourer, e.g. 32.50 → 65 sell at 50%
  margins: Record<MarginKey, number | null>;
  codeMargins: Record<string, number>; // per cost code ("1801") — overrides the category
  codeMarginSource: string; // where the code margins came from
  useStoreRetail: boolean; // price Robins Interiors (Square) products at the store's retail price
  pmFeeNewBuild: number; // 0.15 per the custom-home proposal standard
  contingency: number; // fraction of subtotal (0 = none)
  hst: number; // 0.15 NB
  minMargin: number | null; // overall gross margin floor — below needs the owner
  autoApproveLimit: number | null; // quotes above this always need the owner
}

export interface Settings {
  version: number;
  components: ToolComponent[];
  labour: LabourTask[];
  rates: Rate[];
  pricing: PricingRules;
  company: {
    name: string;
    address: string;
    phone: string;
    signer: string;
    signerTitle: string;
  };
  terms: {
    paymentScheduleNewBuild: string; // one draw per line, e.g. "Deposit upon signing: 10%"
  };
  nextNumbers: Record<string, number>; // "REN2026" -> 8
  updatedAt: string;
  updatedBy: string;
}

/* ----------------------------- results ----------------------------- */

export interface PricedLine extends Line {
  extCost: number; // qty × unitCost (0 if unpriced)
  margin: number; // gross margin applied
  marginFrom: "line" | "quote" | "code" | "category" | "retail" | "none";
  sell: number; // extCost ÷ (1 − margin)
}

export interface Totals {
  material: number;
  labour: number;
  sub: number;
  allowance: number;
  cost: number;
  sellBeforeFees: number;
  pmFee: number;
  contingency: number;
  subtotal: number; // ex HST
  hst: number;
  total: number;
  margin: number; // (subtotal - cost) / subtotal
}

export interface ReviewItem {
  level: "block" | "warn" | "info";
  message: string;
  lineId?: string;
  owner?: boolean; // company policy — needs the owner's approval
}

// Something the salesperson needs to answer to finish the quote.
export type Question =
  | { kind: "rate"; key: string; label: string; unit: string; lineIds: string[] }
  | { kind: "price"; lineId: string; label: string; unit: string; why: string; codes?: string[] }
  | { kind: "field"; step: string; field: string; label: string }
  | { kind: "cabinets"; label: string; roomId: string }
  | { kind: "cabinetSku"; setId: string; lineId: string; sku: string; label: string; suggestions: string[] }
  | { kind: "margin"; key: MarginKey; label: string };
