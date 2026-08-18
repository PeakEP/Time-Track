// Single source of truth for all Finish Selections domain types.
// Style mirrors cabinet-designer: `type` aliases only (no interfaces),
// string-literal unions for enums, explicit nullable/optional fields.

// ---- Catalog (the products Robins Interiors & Design offers) ----

// An option is either included in the base package or a priced upgrade.
export type PricingMode = "included" | "upgrade";

export type FinishOption = {
  id: string;
  name: string;
  description?: string;
  pricing: PricingMode;
  // Upgrade cost (or allowance) in dollars. 0 when included in the base price.
  price: number;
  // Product photo path (resolved under BASE_URL). When absent, `swatch` drives
  // a generated placeholder so the demo renders without real photography.
  image?: string;
  // Hex colour used to generate a placeholder swatch when `image` is missing.
  swatch?: string;
};

export type Category = {
  id: string;
  name: string;
  description?: string;
  // When true, more than one option may be chosen (e.g. optional add-ons).
  multi?: boolean;
  options: FinishOption[];
};

export type CatalogMeta = {
  currency: string; // "CAD"
  pricing_year: number;
  // Standard finish-package price the selections add onto.
  base_price: number;
  notes?: string;
};

export type Catalog = {
  _meta: CatalogMeta;
  categories: Category[];
};

// ---- Project (one client's set of selections) ----

export type DiscountType = "percent" | "flat";

export type Discount = {
  label: string;
  type: DiscountType;
  value: number;
};

export type ProjectMeta = {
  client: string;
  project: string;
  address: string;
  date: string; // ISO yyyy-mm-dd
  salesRep: string;
  notes: string;
};

export type Project = {
  meta: ProjectMeta;
  basePrice: number;
  // categoryId -> selected optionId(s)
  selections: Record<string, string[]>;
  // optionId -> overridden upgrade price (designer mode)
  overrides: Record<string, number>;
  discount: Discount;
};

// Designer sees costs, overrides and discount controls; client sees a clean
// selection experience.
export type UserMode = "designer" | "client";

// Versioned wrapper written to .json project files (matches cabinet-designer).
export type ProjectFile = {
  app: "jmrc-finish-selections";
  version: 1;
  savedAt: string;
  project: Project;
};
