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

export type CatalogSource = "jmrc" | "square";

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

/* ----------------------------- rooms ----------------------------- */

export type RoomKind =
  | "kitchen" | "bathroom" | "ensuite" | "bedroom" | "living" | "dining"
  | "basement" | "laundry" | "hallway" | "office" | "mudroom" | "other";

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
  floor: "none" | "flooring" | "tile";
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

  // Selections (catalog item ids) — chosen in the Selections step
  flooringItemId: string;
  tileItemId: string;
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
  | "manual" // typed by the rep (needs review)
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
  overrides: Record<string, { qty?: number; unitCost?: number | null; catalogItemId?: string; removed?: boolean }>;
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

// Owner rate (labour, sub-trade, allowance) per takeoff unit. null = not set.
export interface Rate {
  key: string;
  section: string;
  label: string;
  unit: string;
  kind: LineKind;
  value: number | null;
  note: string;
}

export interface PricingRules {
  materialMarkup: number | null; // fraction
  labourMarkup: number | null;
  subMarkup: number | null;
  pmFeeNewBuild: number; // 0.15 per the custom-home proposal standard
  contingency: number; // fraction of subtotal (0 = none)
  hst: number; // 0.15 NB
  minMargin: number | null; // gross margin floor for auto-approval
  autoApproveLimit: number | null; // quotes above this always need the owner
  hideCostsFromSales: boolean;
}

export interface Settings {
  version: number;
  components: ToolComponent[];
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
  markup: number; // fraction applied
  sell: number; // extCost × (1 + markup)
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
}
