export type TierKey = "essential" | "plus" | "trend" | "premium" | "elite";

export type TierPrices = {
  essential: number | null;
  plus: number | null;
  trend: number | null;
  premium: number | null;
  elite: number | null;
};

export type Finish = {
  code: string;
  name: string;
  tier: TierKey;
  tierName: string;
};

export type Product = {
  sku: string;
  desc: string;
  cat: string;
  dims: string;
  width_in: number | null;
  depth_in: number | null;
  height_in: number | null;
  pb?: TierPrices | null;
  ply?: TierPrices | null;
  flat?: TierPrices | null;
};

export type CatalogMeta = {
  source?: string;
  pricing_year?: number;
  currency?: string;
  price_type?: string;
  dealer_discount: number;
  box_types?: Record<string, string>;
  notes?: string;
};

export type Catalog = {
  _meta: CatalogMeta;
  tiers: Record<TierKey, string>;
  finishes: Finish[];
  products: Product[];
};

export type BoxMaterial = "PB" | "PLY";

export type Rotation = 0 | 90 | 180 | 270;
export type ItemKind = "cabinet" | "appliance" | "window" | "door" | "filler" | "panel" | "accessory";

export type Item = {
  id: string;
  kind: ItemKind;
  sku?: string;
  x: number;
  y: number;
  rotation: Rotation;
  width: number;
  depth: number;
  height: number;
  mountZ?: number;
  hingeSide?: "left" | "right";
  swing?: "in" | "out";
  sillHeight?: number;
  label?: string;
  // schedule-only items (panels/fillers/hardware) carry qty rather than geometry placement
  qty?: number;
  scheduleOnly?: boolean;
};

export type Point = { x: number; y: number };

export type Room = {
  points: Point[];
  wallThickness: number;
};

export type ProjectMeta = {
  name: string;
  client: string;
  address: string;
  jobNumber?: string;
  date: string;
};

export type ProjectSettings = {
  finishCode: string;
  boxMaterial: BoxMaterial;
  wallHeight: number;
  wallCabinetAFF: number;
  counterHeight: number;
  markup: number;
  hstRate: number;
  wallMode: 1 | 2 | 3 | 4;
};

export type Project = {
  meta: ProjectMeta;
  settings: ProjectSettings;
  room: Room;
  items: Item[];
};
