import type { Answers, FloorType, ProjectType, Quote, Room, RoomKind } from "../types";

// The guided interview. Each field is an Answers key; `types` limits it to
// project types, `show` hides it until it applies. The same list feeds the
// document reader (AI) so it knows what to look for.

export type FieldType = "text" | "textarea" | "number" | "select" | "bool" | "money";

export interface Field {
  key: keyof Answers;
  label: string;
  type: FieldType;
  unit?: string;
  help?: string;
  options?: { value: string | number; label: string }[];
  types?: ProjectType[];
  show?: (a: Answers) => boolean;
  min?: number;
  step?: number;
}

export interface Step {
  id: string;
  title: string;
  intro: string;
  types?: ProjectType[];
  fields: Field[];
}

const NEW: ProjectType[] = ["shop", "custom-home"];
const RENO: ProjectType[] = ["renovation", "remodel"];

// Floor finishes, each mapped to its JMRC cost code. Pick the type, then only
// that type's products show. `tile` floors are set with thinset/grout; the rest
// are floating/plank floors. "none" = floor not changed in that room.
export const FLOOR_TYPES: { value: FloorType; label: string; codes: string[]; tile?: boolean }[] = [
  { value: "none", label: "No change", codes: [] },
  { value: "spc", label: "SPC", codes: ["1701"] },
  { value: "laminate", label: "Laminate", codes: ["1702"] },
  { value: "hardwood", label: "Engineered hardwood", codes: ["1703"] },
  { value: "lvt", label: "LVP / LVT", codes: ["1704"] },
  { value: "tile", label: "Tile", codes: ["1801"], tile: true },
  { value: "other", label: "Other flooring", codes: ["1705"] },
];
export const floorType = (v: string) => FLOOR_TYPES.find((t) => t.value === v) || FLOOR_TYPES[0];
// Floor types a build/room can actually be finished in (everything but "none").
export const REAL_FLOOR_TYPES = FLOOR_TYPES.filter((t) => t.value !== "none");

export const STEPS: Step[] = [
  {
    id: "client",
    title: "Client & project",
    intro: "Who the quote is for and where the work is.",
    fields: [
      { key: "clientName", label: "Client name", type: "text" },
      { key: "siteAddress", label: "Site address", type: "text", help: "Street, town, NB postal code" },
      { key: "clientPhone", label: "Phone", type: "text" },
      { key: "clientEmail", label: "Email", type: "text" },
      { key: "clientType", label: "Who's paying", type: "select", options: [{ value: "direct", label: "Client direct" }, { value: "insurance", label: "Insurance restoration (TPA)" }], types: RENO },
      { key: "claimNo", label: "Claim no.", type: "text", show: (a) => a.clientType === "insurance" },
      { key: "tpaFile", label: "TPA file no.", type: "text", show: (a) => a.clientType === "insurance" },
      { key: "insurer", label: "Insurer", type: "text", show: (a) => a.clientType === "insurance" },
      { key: "tpa", label: "TPA / restoration company", type: "text", show: (a) => a.clientType === "insurance" },
      { key: "estimator", label: "TPA estimator", type: "text", show: (a) => a.clientType === "insurance" },
      { key: "scopeSummary", label: "One-line scope", type: "text", help: "e.g. \"Main bath and kitchen renovation\" — appears on the quote" },
    ],
  },
  {
    id: "building",
    title: "Building",
    intro: "Size and shape. Take these off the drawings — or let the document reader fill them in.",
    types: NEW,
    fields: [
      { key: "length", label: "Building length", type: "number", unit: "ft" },
      { key: "width", label: "Building width (truss span)", type: "number", unit: "ft" },
      { key: "storeys", label: "Storeys", type: "select", options: [{ value: 1, label: "1" }, { value: 2, label: "2" }] },
      { key: "wallHeight", label: "Wall height", type: "select", options: [8, 9, 10, 12, 14, 16].map((v) => ({ value: v, label: `${v}'` })), help: "8' walls use 92-5/8\" studs (finished 8'-1-1/8\")" },
      { key: "roofPitch", label: "Roof pitch", type: "select", options: [3, 4, 5, 6, 7, 8, 9, 10, 12].map((v) => ({ value: v, label: `${v}/12` })) },
      { key: "eaveOverhang", label: "Eave overhang", type: "number", unit: "ft", step: 0.25 },
      { key: "rakeOverhang", label: "Rake (gable) overhang", type: "number", unit: "ft", step: 0.25 },
      { key: "foundation", label: "Foundation", type: "select", options: [
        { value: "slab", label: "Slab-on-grade, monolithic footings" },
        { value: "frost-wall", label: "Frost wall + slab" },
        { value: "basement-icf", label: "ICF basement" },
        { value: "existing", label: "Existing foundation" },
      ] },
      { key: "slabThicknessIn", label: "Slab thickness", type: "number", unit: "in", show: (a) => a.foundation !== "existing" },
    ],
  },
  {
    id: "openings",
    title: "Windows, doors & layout",
    intro: "Counts from the floor plan and door/window schedule.",
    types: NEW,
    fields: [
      { key: "windowCount", label: "Windows", type: "number", unit: "ea" },
      { key: "windowAvgW", label: "Average window width", type: "number", unit: "ft", step: 0.5 },
      { key: "windowAvgH", label: "Average window height", type: "number", unit: "ft", step: 0.5 },
      { key: "extDoorCount", label: "Exterior doors (incl. patio)", type: "number", unit: "ea" },
      { key: "windowsDoorsQuote", label: "Windows & ext. doors supplier quote", type: "money", help: "Leave 0 to carry the owner's per-window allowance" },
      { key: "overheadDoorCount", label: "Overhead doors", type: "number", unit: "ea", types: ["shop"] },
      { key: "overheadDoorW", label: "Overhead door width", type: "number", unit: "ft", types: ["shop"], show: (a) => a.overheadDoorCount > 0 },
      { key: "overheadDoorH", label: "Overhead door height", type: "number", unit: "ft", types: ["shop"], show: (a) => a.overheadDoorCount > 0 },
      { key: "overheadDoorQuote", label: "Overhead doors supplier quote", type: "money", types: ["shop"], show: (a) => a.overheadDoorCount > 0 },
      { key: "interiorWallLF", label: "Interior walls (total length)", type: "number", unit: "LF", help: "Rough guide: about 1 LF per 10 SF of house" },
      { key: "interiorDoorCount", label: "Interior doors", type: "number", unit: "ea" },
      { key: "trussQuote", label: "Truss package supplier quote", type: "money", help: "Leave 0 to carry the owner's truss allowance" },
    ],
  },
  {
    id: "interior",
    title: "Interior & systems",
    intro: "Rooms, finishes and mechanical.",
    types: NEW,
    fields: [
      { key: "insulated", label: "Insulated & heated", type: "bool", types: ["shop"] },
      { key: "interiorFinish", label: "Interior wall finish", type: "select", types: ["shop"], options: [{ value: "none", label: "Open studs" }, { value: "osb", label: "OSB liner" }, { value: "drywall", label: "Drywall (Type X)" }] },
      { key: "bathroomCount", label: "Bathrooms", type: "number", unit: "ea" },
      { key: "kitchenCabinetLF", label: "Kitchen cabinet run", type: "number", unit: "LF", types: ["custom-home"] },
      { key: "cabinetQuote", label: "Cabinet quote (Cabinet Designer / supplier)", type: "money", types: ["custom-home"], help: "Leave 0 to carry the owner's $/LF cabinet allowance" },
      { key: "countertopSF", label: "Countertops", type: "number", unit: "SF", types: ["custom-home"] },
      { key: "flooringType", label: "Main floor type", type: "select", options: REAL_FLOOR_TYPES.map((t) => ({ value: t.value, label: t.label })), help: "The rest of the floor area (not tiled) uses this. Pick the product on the Products step." },
      { key: "tileFloorSF", label: "Tile floors (baths, laundry, entry)", type: "number", unit: "SF", types: ["custom-home"] },
      { key: "showerTileSF", label: "Shower wall tile (all showers)", type: "number", unit: "SF", types: ["custom-home"] },
      { key: "lightFixtureCount", label: "Light fixtures", type: "number", unit: "ea" },
      { key: "heating", label: "Heating", type: "select", options: [{ value: "none", label: "None" }, { value: "baseboard", label: "Electric baseboard" }, { value: "mini-split", label: "Mini-split heat pump" }, { value: "forced-air", label: "Forced air" }] },
      { key: "siding", label: "Siding", type: "select", options: [{ value: "vinyl", label: "Vinyl" }, { value: "engineered", label: "Engineered wood" }, { value: "steel", label: "Steel" }] },
      { key: "finishLevel", label: "Finish level", type: "select", options: [{ value: "standard", label: "Standard" }, { value: "upgraded", label: "Upgraded" }, { value: "premium", label: "Premium" }] },
      { key: "disposalBins", label: "Disposal bins (0 = estimate)", type: "number", unit: "ea" },
    ],
  },
  {
    id: "rooms",
    title: "Rooms & scope",
    intro: "Add each room in the job and tick what's being done in it.",
    types: RENO,
    fields: [
      { key: "occupied", label: "Home is lived in during the work", type: "bool" },
      { key: "cabinetQuote", label: "Cabinet quote (Cabinet Designer / supplier)", type: "money", help: "Leave 0 to carry the owner's $/LF cabinet allowance" },
      { key: "disposalBins", label: "Disposal bins (0 = estimate)", type: "number", unit: "ea" },
    ],
  },
  { id: "cabinets", title: "Cabinets", intro: "Price the cabinets and vanities from Aline, Oppein or Divine — type or paste the SKU list from the design.", types: ["renovation", "remodel", "custom-home"], fields: [] },
  { id: "selections", title: "Products", intro: "Pick the products to price from the catalog. Anything left blank uses the default set in Settings.", fields: [] },
  { id: "documents", title: "Notes & drawings", intro: "Upload drawings and notes, or connect the client folder. The document reader suggests answers for you to accept.", fields: [] },
  {
    id: "wrap",
    title: "Inclusions & exclusions",
    intro: "Anything specific to this job. The standard clauses are added automatically.",
    fields: [
      { key: "inclusionsExtra", label: "Extra inclusions (one per line)", type: "textarea" },
      { key: "exclusionsExtra", label: "Extra exclusions (one per line)", type: "textarea" },
      { key: "notes", label: "Internal notes (not on the proposal)", type: "textarea" },
    ],
  },
  { id: "review", title: "Review & price", intro: "Takeoff, pricing and anything that needs a second look.", fields: [] },
];

export const stepsFor = (type: ProjectType) => STEPS.filter((s) => !s.types || s.types.includes(type));
export const fieldVisible = (f: Field, type: ProjectType, a: Answers) => (!f.types || f.types.includes(type)) && (!f.show || f.show(a));

export const ROOM_KINDS: { value: RoomKind; label: string }[] = [
  { value: "kitchen", label: "Kitchen" }, { value: "bathroom", label: "Bathroom" }, { value: "ensuite", label: "Ensuite" },
  { value: "bedroom", label: "Bedroom" }, { value: "living", label: "Living room" }, { value: "dining", label: "Dining" },
  { value: "basement", label: "Basement" }, { value: "laundry", label: "Laundry" }, { value: "hallway", label: "Hallway / entry" },
  { value: "office", label: "Office" }, { value: "mudroom", label: "Mudroom" }, { value: "other", label: "Other" },
];

export const uid = () => (typeof globalThis.crypto?.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

// Sensible starting scope per room type — the rep untick what isn't in the job.
export function newRoom(kind: RoomKind = "bedroom", name = ""): Room {
  const wet = kind === "bathroom" || kind === "ensuite";
  const kitchen = kind === "kitchen";
  return {
    id: uid(), name: name || ROOM_KINDS.find((k) => k.value === kind)?.label || "Room", kind,
    length: wet ? 8 : 12, width: wet ? 5 : 11, height: 8, doors: 1, windows: wet ? 0 : 1,
    demoFloor: true, demoWalls: false,
    floor: wet || kind === "laundry" ? "tile" : "spc",
    paintWalls: true, paintCeiling: true, drywall: "patch", baseboard: true,
    newInteriorDoors: 0, lightFixtures: wet || kitchen ? 1 : 0,
    cabinetLF: kitchen ? 16 : 0, countertopSF: kitchen ? 30 : 0, backsplashSF: kitchen ? 25 : 0,
    toilet: wet, vanity: wet, tubShower: wet ? "tub" : "none", showerWallTileSF: wet ? 80 : 0,
    wallsRemovedLF: 0, loadBearingRemoved: false, newWallsLF: 0, plumbingRelocated: false, notes: "",
  };
}

export function blankAnswers(type: ProjectType): Answers {
  const shop = type === "shop";
  return {
    clientName: "", clientEmail: "", clientPhone: "", siteAddress: "", clientType: "direct",
    claimNo: "", tpaFile: "", insurer: "", tpa: "", estimator: "", scopeSummary: "",
    length: 0, width: 0, storeys: 1, wallHeight: shop ? 12 : 8, roofPitch: shop ? 4 : 6,
    eaveOverhang: 1, rakeOverhang: 1, foundation: "slab", slabThicknessIn: shop ? 6 : 4,
    windowCount: 0, windowAvgW: 3, windowAvgH: 4, extDoorCount: shop ? 1 : 2,
    overheadDoorCount: shop ? 1 : 0, overheadDoorW: 10, overheadDoorH: shop ? 10 : 8,
    interiorWallLF: 0, interiorDoorCount: 0, bathroomCount: shop ? 0 : 2, kitchenCabinetLF: 0, countertopSF: 0,
    tileFloorSF: 0, showerTileSF: 0, finishLevel: "standard", insulated: !shop, interiorFinish: shop ? "osb" : "drywall",
    siding: shop ? "steel" : "vinyl", heating: shop ? "none" : "mini-split", lightFixtureCount: 0,
    rooms: [], occupied: true, disposalBins: 0,
    flooringType: "spc", floorItemIds: {}, showerTileItemId: "", backsplashItemId: "", countertopItemId: "", paintItemId: "",
    interiorDoorItemId: "", lightFixtureItemId: "", toiletItemId: "", vanityItemId: "", faucetItemId: "", tubItemId: "",
    windowsDoorsQuote: 0, trussQuote: 0, cabinetQuote: 0, overheadDoorQuote: 0,
    inclusionsExtra: "", exclusionsExtra: "", notes: "",
  };
}

export const numberPrefix = (type: ProjectType, year = new Date().getFullYear()) => `${type === "shop" || type === "custom-home" ? "CUS" : "REN"}${year}`;

export function newQuote(type: ProjectType, by: string): Quote {
  const now = new Date().toISOString();
  return {
    id: uid(), number: "", version: 1, type, title: "", status: "draft",
    answers: blankAnswers(type), manualLines: [], overrides: {}, attachments: [], cabinetSets: [], rates: {}, margins: {},
    ai: { suggestions: [], summary: "", ranAt: "" }, folderName: "",
    createdBy: by, createdAt: now, updatedAt: now,
  };
}

// Product pickers on the Selections step. Flooring is handled separately (by
// floor type) in the Products step; these are the rest.
export const PRODUCT_PICKS: { key: keyof Answers; label: string; codes: string[]; types?: ProjectType[] }[] = [
  { key: "showerTileItemId", label: "Shower wall tile", codes: ["1801", "1802"] },
  { key: "backsplashItemId", label: "Backsplash", codes: ["1802", "1801"], types: ["renovation", "remodel", "custom-home"] },
  { key: "countertopItemId", label: "Countertop", codes: ["2001", "2002"] },
  { key: "paintItemId", label: "Wall paint", codes: ["2301"] },
  { key: "interiorDoorItemId", label: "Interior door", codes: ["1501"] },
  { key: "lightFixtureItemId", label: "Light fixture", codes: ["1001", "1002", "1003", "1004", "1005", "1009"] },
  { key: "toiletItemId", label: "Toilet", codes: ["1109"] },
  { key: "vanityItemId", label: "Vanity", codes: ["1110"] },
  { key: "faucetItemId", label: "Bathroom faucet", codes: ["1105"] },
  { key: "tubItemId", label: "Tub / shower", codes: ["1107"] },
];

// Quotes saved by earlier versions lack the newer fields.
export function normalizeQuote(q: Quote): Quote {
  const answers = { ...blankAnswers(q.type), ...q.answers } as Answers & { flooringItemId?: string; tileItemId?: string };
  // Migrate the old single Flooring / Floor-tile picks to the per-type map.
  if (!answers.floorItemIds || typeof answers.floorItemIds !== "object") answers.floorItemIds = {};
  if (answers.flooringItemId && !answers.floorItemIds.spc) answers.floorItemIds.spc = answers.flooringItemId;
  if (answers.tileItemId && !answers.floorItemIds.tile) answers.floorItemIds.tile = answers.tileItemId;
  delete answers.flooringItemId;
  delete answers.tileItemId;
  // Old rooms used floor "flooring" | "tile"; map the generic one to SPC.
  for (const r of answers.rooms || []) {
    if ((r.floor as string) === "flooring") r.floor = "spc";
    else if (!FLOOR_TYPES.some((t) => t.value === r.floor)) r.floor = "none";
  }
  return {
    ...q,
    answers,
    cabinetSets: q.cabinetSets || [],
    rates: q.rates || {},
    margins: q.margins || {},
    overrides: q.overrides || {},
    manualLines: q.manualLines || [],
  };
}
