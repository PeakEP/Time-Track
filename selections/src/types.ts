// Core data model for the Robins Interiors & Designs finish selection app.

export type PricingMode = "included" | "upgrade";

export interface FinishOption {
  id: string;
  name: string;
  description?: string;
  /** Image as a URL or data URI. Swap placeholder swatches for real product photos. */
  image: string;
  pricing: PricingMode;
  /** Upgrade cost (or allowance) in dollars. 0 when included in the base price. */
  price: number;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  /** Allow more than one option to be chosen (e.g. optional add-ons). */
  multi?: boolean;
  options: FinishOption[];
}

export type DiscountType = "percent" | "flat";

export interface Discount {
  label: string;
  type: DiscountType;
  value: number;
}

export interface ProjectInfo {
  clientName: string;
  projectName: string;
  address: string;
  date: string;
  salesRep: string;
  notes: string;
}

export type UserMode = "designer" | "client";

/** A saved/serializable project document. */
export interface ProjectDocument {
  version: 1;
  info: ProjectInfo;
  basePrice: number;
  /** categoryId -> selected optionId(s) */
  selections: Record<string, string[]>;
  /** optionId -> overridden upgrade price (designer mode) */
  priceOverrides: Record<string, number>;
  discount: Discount;
  savedAt: string;
}
